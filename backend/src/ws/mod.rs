use crate::models::{Answer, OptionItem, Participant, Question, Quiz, Session};
use crate::state::{ActiveRoom, AppState, WsEvent, WsLeaderboardEntry, WsOptionPublic, WsParticipant};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast;
use tracing::{error, info, warn};
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct WsQuery {
    pub role: Option<String>,
    pub name: Option<String>,
}

pub async fn ws_session_handler(
    ws: WebSocketUpgrade,
    Path(pin): Path<String>,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, pin, query, state))
}

async fn handle_socket(socket: WebSocket, pin: String, query: WsQuery, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // 1. Find session in DB (only active, not finished or cancelled)
    let session = match sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE pin = $1 AND status NOT IN ('finished', 'cancelled') ORDER BY created_at DESC LIMIT 1"
    )
        .bind(&pin)
        .fetch_optional(&state.pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            warn!("WS Conexión rechazada: Sesión no encontrada para PIN {}", pin);
            let _ = sender
                .send(Message::Text(
                    serde_json::to_string(&WsEvent::Error {
                        message: "Sesión no encontrada o PIN inactivo".to_string(),
                    })
                    .unwrap(),
                ))
                .await;
            return;
        }
        Err(e) => {
            error!("Error buscando sesión: {:?}", e);
            return;
        }
    };

    // 2. Get or create Broadcast channel for this PIN room
    let room_sender = {
        let mut rooms = state.rooms.write().await;
        if let Some(room) = rooms.get(&pin) {
            room.sender.clone()
        } else {
            let (tx, _rx) = broadcast::channel(100);
            let active_room = ActiveRoom {
                pin: pin.clone(),
                session_id: session.id,
                quiz_id: session.quiz_id,
                sender: tx.clone(),
            };
            rooms.insert(pin.clone(), active_room);
            tx
        }
    };

    let mut room_receiver = room_sender.subscribe();

    // If student provided a name in query params, register or find them
    let mut current_participant_id: Option<Uuid> = None;

    if query.role.as_deref() == Some("student") {
        if let Some(ref name) = query.name {
            let name = name.trim();
            if !name.is_empty() && name != "Estudiante" {
                let existing: Option<(Uuid,)> = sqlx::query_as(
                    "SELECT id FROM participants WHERE session_id = $1 AND LOWER(name) = LOWER($2)",
                )
                .bind(session.id)
                .bind(name)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);

                let p_id = if let Some((existing_id,)) = existing {
                    existing_id
                } else {
                    let new_id = Uuid::new_v4();
                    let _ = sqlx::query(
                        "INSERT INTO participants (id, session_id, name, score, correct_count) VALUES ($1, $2, $3, 0.0, 0)",
                    )
                    .bind(new_id)
                    .bind(session.id)
                    .bind(name)
                    .execute(&state.pool)
                    .await;
                    new_id
                };

                current_participant_id = Some(p_id);
                info!("Estudiante '{}' ({}) conectado a la sala PIN {}", name, p_id, pin);

                // Broadcast updated participant list to lobby
                broadcast_lobby_update(&state.pool, session.id, &room_sender).await;
            }
        }
    }

    // If teacher connected, broadcast lobby update so teacher sees all existing participants
    if query.role.as_deref() == Some("teacher") {
        broadcast_lobby_update(&state.pool, session.id, &room_sender).await;
        if session.status == "playing" || session.status == "reviewing" {
            broadcast_live_answer_update(&state.pool, session.id, session.quiz_id, &room_sender).await;
        }
    }

    // If session is already playing when student connects, send current question to this student
    if session.status == "playing" {
        send_current_question_to_client(&state.pool, session.quiz_id, session.current_question_index as usize, &mut sender).await;
    }

    // Task 1: Forward broadcast messages from room to this WebSocket client
    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = room_receiver.recv().await {
            if let Ok(msg_text) = serde_json::to_string(&event) {
                if sender.send(Message::Text(msg_text)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Task 2: Receive messages from this WebSocket client and handle actions
    let pool = state.pool.clone();
    let rooms_map = state.rooms.clone();
    let pin_clone = pin.clone();
    let tx = room_sender.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if let Message::Text(text) = message {
                let json_val: Result<serde_json::Value, _> = serde_json::from_str(&text);
                match json_val {
                    Ok(val) => {
                        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        let payload = val.get("payload");

                        match msg_type {
                            "StudentJoin" => {
                                let name = payload
                                    .and_then(|p| p.get("name"))
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();

                                if !name.is_empty() {
                                    let existing: Option<(Uuid,)> = sqlx::query_as(
                                        "SELECT id FROM participants WHERE session_id = $1 AND LOWER(name) = LOWER($2)",
                                    )
                                    .bind(session.id)
                                    .bind(&name)
                                    .fetch_optional(&pool)
                                    .await
                                    .unwrap_or(None);

                                    let p_id = if let Some((existing_id,)) = existing {
                                        existing_id
                                    } else {
                                        let new_id = Uuid::new_v4();
                                        let _ = sqlx::query(
                                            "INSERT INTO participants (id, session_id, name, score, correct_count) VALUES ($1, $2, $3, 0.0, 0)",
                                        )
                                        .bind(new_id)
                                        .bind(session.id)
                                        .bind(&name)
                                        .execute(&pool)
                                        .await;
                                        new_id
                                    };

                                    current_participant_id = Some(p_id);
                                    broadcast_lobby_update(&pool, session.id, &tx).await;
                                }
                            }

                            "TeacherStartQuiz" => {
                                info!("Docente inició quiz para sesión {}", pin_clone);
                                let _ = sqlx::query(
                                    "UPDATE sessions SET status = 'playing', current_question_index = 0 WHERE id = $1",
                                )
                                .bind(session.id)
                                .execute(&pool)
                                .await;

                                broadcast_question(&pool, session.quiz_id, 0, &tx).await;
                                broadcast_live_answer_update(&pool, session.id, session.quiz_id, &tx).await;
                            }

                            "StudentSubmitAnswer" => {
                                if let Some(p_id) = current_participant_id {
                                    // 1. Extract question_id safely (or find current question)
                                    let q_id_str = payload
                                        .and_then(|p| p.get("question_id"))
                                        .and_then(|v| v.as_str());

                                    let parsed_q_id = q_id_str.and_then(|s| Uuid::parse_str(s).ok());

                                    let final_q_id = match parsed_q_id {
                                        Some(qid) => Some(qid),
                                        None => {
                                            let questions = sqlx::query_as::<_, Question>(
                                                "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
                                            )
                                            .bind(session.quiz_id)
                                            .fetch_all(&pool)
                                            .await
                                            .unwrap_or_default();

                                            let cur_session = sqlx::query_as::<_, Session>(
                                                "SELECT * FROM sessions WHERE id = $1",
                                            )
                                            .bind(session.id)
                                            .fetch_optional(&pool)
                                            .await
                                            .ok()
                                            .flatten();

                                            let idx = cur_session.map(|s| s.current_question_index).unwrap_or(0);
                                            questions.get(idx as usize).map(|q| q.id)
                                        }
                                    };

                                    if let Some(q_id) = final_q_id {
                                        // 2. Extract option_id safely
                                        let opt_id_str = payload
                                            .and_then(|p| p.get("option_id"))
                                            .and_then(|v| v.as_str());

                                        let target_opt_id = opt_id_str.and_then(|s| Uuid::parse_str(s).ok());

                                        let is_correct = if let Some(opt_id) = target_opt_id {
                                            let opt = sqlx::query_as::<_, OptionItem>(
                                                "SELECT * FROM options WHERE id = $1",
                                            )
                                            .bind(opt_id)
                                            .fetch_optional(&pool)
                                            .await
                                            .ok()
                                            .flatten();

                                            opt.map(|o| o.is_correct).unwrap_or(false)
                                        } else {
                                            false
                                        };

                                        let time_taken = payload
                                            .and_then(|p| p.get("time_taken_seconds"))
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0) as i32;

                                        let answer_id = Uuid::new_v4();

                                        let insert_res = sqlx::query(
                                            r#"
                                            INSERT INTO answers (id, session_id, participant_id, question_id, option_id, is_correct, time_taken_seconds)
                                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                                            ON CONFLICT (session_id, participant_id, question_id) 
                                            DO UPDATE SET option_id = $5, is_correct = $6, time_taken_seconds = $7
                                            "#,
                                        )
                                        .bind(answer_id)
                                        .bind(session.id)
                                        .bind(p_id)
                                        .bind(q_id)
                                        .bind(target_opt_id)
                                        .bind(is_correct)
                                        .bind(time_taken)
                                        .execute(&pool)
                                        .await;

                                        if let Err(e) = insert_res {
                                            error!("Error guardando respuesta en DB: {:?}", e);
                                        }

                                        // Total questions for proportional score calculation
                                        let total_questions_count: (i64,) = sqlx::query_as(
                                            "SELECT COUNT(*) FROM questions WHERE quiz_id = $1",
                                        )
                                        .bind(session.quiz_id)
                                        .fetch_one(&pool)
                                        .await
                                        .unwrap_or((1,));
                                        let total_q_f = total_questions_count.0.max(1) as f64;

                                        // Update participant cumulative score and correct_count in DB
                                        let correct_count_res: (i64,) = sqlx::query_as(
                                            "SELECT COUNT(*) FROM answers WHERE session_id = $1 AND participant_id = $2 AND is_correct = TRUE",
                                        )
                                        .bind(session.id)
                                        .bind(p_id)
                                        .fetch_one(&pool)
                                        .await
                                        .unwrap_or((0,));

                                        let cur_correct = correct_count_res.0;
                                        let calculated_score = ((cur_correct as f64 / total_q_f) * 5.0 * 10.0).round() / 10.0;

                                        let _ = sqlx::query(
                                            "UPDATE participants SET correct_count = $1, score = $2 WHERE id = $3",
                                        )
                                        .bind(cur_correct as i32)
                                        .bind(calculated_score)
                                        .bind(p_id)
                                        .execute(&pool)
                                        .await;

                                        // 3. Broadcast live answers update to teacher immediately
                                        broadcast_live_answer_update(&pool, session.id, session.quiz_id, &tx).await;

                                        // 4. Check if all participants have answered
                                        let total_participants: (i64,) = sqlx::query_as(
                                            "SELECT COUNT(*) FROM participants WHERE session_id = $1",
                                        )
                                        .bind(session.id)
                                        .fetch_one(&pool)
                                        .await
                                        .unwrap_or((0,));

                                        let total_answered: (i64,) = sqlx::query_as(
                                            "SELECT COUNT(*) FROM answers WHERE session_id = $1 AND question_id = $2",
                                        )
                                        .bind(session.id)
                                        .bind(q_id)
                                        .fetch_one(&pool)
                                        .await
                                        .unwrap_or((0,));

                                        info!("PIN {}: {}/{} estudiantes han respondido", pin_clone, total_answered.0, total_participants.0);

                                        // If ALL students have submitted their answer, automatically reveal results to all students and teacher!
                                        if total_answered.0 >= total_participants.0 && total_participants.0 > 0 {
                                            info!("🎉 Todos los estudiantes ({}) respondieron. Revelando resultados automáticamente...", total_participants.0);

                                            let _ = sqlx::query(
                                                "UPDATE sessions SET status = 'reviewing' WHERE id = $1",
                                            )
                                            .bind(session.id)
                                            .execute(&pool)
                                            .await;

                                            broadcast_question_results(&pool, session.id, session.quiz_id, &tx).await;
                                        }
                                    }
                                } else {
                                    warn!("StudentSubmitAnswer recibido pero current_participant_id es None");
                                }
                            }

                            "TeacherRevealResults" => {
                                let _ = sqlx::query(
                                    "UPDATE sessions SET status = 'reviewing' WHERE id = $1",
                                )
                                .bind(session.id)
                                .execute(&pool)
                                .await;

                                broadcast_question_results(&pool, session.id, session.quiz_id, &tx).await;
                            }

                            "TeacherNextQuestion" => {
                                let current_session = sqlx::query_as::<_, Session>(
                                    "SELECT * FROM sessions WHERE id = $1",
                                )
                                .bind(session.id)
                                .fetch_one(&pool)
                                .await;

                            if let Ok(s) = current_session {
                                let next_idx = s.current_question_index + 1;

                                let total_q: (i64,) = sqlx::query_as(
                                    "SELECT COUNT(*) FROM questions WHERE quiz_id = $1",
                                )
                                .bind(session.quiz_id)
                                .fetch_one(&pool)
                                .await
                                .unwrap_or((0,));

                                if next_idx < total_q.0 as i32 {
                                    let _ = sqlx::query(
                                        "UPDATE sessions SET status = 'playing', current_question_index = $1 WHERE id = $2",
                                    )
                                    .bind(next_idx)
                                    .bind(session.id)
                                    .execute(&pool)
                                    .await;

                                    broadcast_question(&pool, session.quiz_id, next_idx as usize, &tx).await;
                                    broadcast_live_answer_update(&pool, session.id, session.quiz_id, &tx).await;
                                } else {
                                    finish_and_broadcast_results(&pool, session.id, total_q.0 as usize, &tx).await;
                                }
                            }
                        }

                        "TeacherEndQuiz" => {
                            let total_q: (i64,) = sqlx::query_as(
                                "SELECT COUNT(*) FROM questions WHERE quiz_id = $1",
                            )
                            .bind(session.quiz_id)
                            .fetch_one(&pool)
                            .await
                            .unwrap_or((1,));

                            finish_and_broadcast_results(&pool, session.id, total_q.0 as usize, &tx).await;
                        }

                        // Cancel quiz before time: Delete record completely, broadcast cancel message
                        "TeacherCancelQuiz" => {
                            info!("Docente canceló la sesión {} antes de tiempo. Eliminando registros...", pin_clone);

                            let _ = sqlx::query("DELETE FROM sessions WHERE id = $1")
                                .bind(session.id)
                                .execute(&pool)
                                .await;

                            let _ = tx.send(WsEvent::QuizCancelled {
                                message: "La evaluación ha sido cancelada por el docente.".to_string(),
                            });

                            let mut rooms = rooms_map.write().await;
                            rooms.remove(&pin_clone);
                        }

                        _ => {
                            warn!("Evento WebSocket no reconocido: {}", msg_type);
                        }
                    }
                }
                Err(e) => {
                    warn!("Mensaje de texto WebSocket no es JSON válido: {:?}", e);
                }
            }
        }
    }
});

// If any task ends, cancel the other
tokio::select! {
    _ = (&mut send_task) => recv_task.abort(),
    _ = (&mut recv_task) => send_task.abort(),
};
}

// Helpers for broadcasting room state
async fn broadcast_lobby_update(pool: &sqlx::PgPool, session_id: Uuid, tx: &broadcast::Sender<WsEvent>) {
    let participants = sqlx::query_as::<_, Participant>(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let ws_participants = participants
        .iter()
        .map(|p| WsParticipant {
            id: p.id.to_string(),
            name: p.name.clone(),
        })
        .collect::<Vec<_>>();

    let count = ws_participants.len();

    let _ = tx.send(WsEvent::LobbyUpdate {
        participants: ws_participants,
        count,
    });
}

async fn broadcast_question(
    pool: &sqlx::PgPool,
    quiz_id: Uuid,
    question_index: usize,
    tx: &broadcast::Sender<WsEvent>,
) {
    let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
        .bind(quiz_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    let questions = sqlx::query_as::<_, Question>(
        "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
    )
    .bind(quiz_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if let Some(q) = questions.get(question_index) {
        let options = sqlx::query_as::<_, OptionItem>(
            "SELECT * FROM options WHERE question_id = $1 ORDER BY label ASC",
        )
        .bind(q.id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let public_options = options
            .iter()
            .map(|o| WsOptionPublic {
                id: o.id.to_string(),
                label: o.label.clone(),
                text: o.text.clone(),
            })
            .collect();

        let _ = tx.send(WsEvent::QuestionStarted {
            question_id: Some(q.id.to_string()),
            question_index,
            total_questions: questions.len(),
            text: q.text.clone(),
            time_limit_seconds: quiz.map(|qz| qz.time_limit_seconds).unwrap_or(30),
            options: public_options,
        });
    }
}

async fn send_current_question_to_client(
    pool: &sqlx::PgPool,
    quiz_id: Uuid,
    question_index: usize,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
) {
    let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
        .bind(quiz_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    let questions = sqlx::query_as::<_, Question>(
        "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
    )
    .bind(quiz_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if let Some(q) = questions.get(question_index) {
        let options = sqlx::query_as::<_, OptionItem>(
            "SELECT * FROM options WHERE question_id = $1 ORDER BY label ASC",
        )
        .bind(q.id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let public_options = options
            .iter()
            .map(|o| WsOptionPublic {
                id: o.id.to_string(),
                label: o.label.clone(),
                text: o.text.clone(),
            })
            .collect();

        let event = WsEvent::QuestionStarted {
            question_id: Some(q.id.to_string()),
            question_index,
            total_questions: questions.len(),
            text: q.text.clone(),
            time_limit_seconds: quiz.map(|qz| qz.time_limit_seconds).unwrap_or(30),
            options: public_options,
        };

        if let Ok(text) = serde_json::to_string(&event) {
            let _ = sender.send(Message::Text(text)).await;
        }
    }
}

async fn broadcast_live_answer_update(
    pool: &sqlx::PgPool,
    session_id: Uuid,
    quiz_id: Uuid,
    tx: &broadcast::Sender<WsEvent>,
) {
    let session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    if let Some(s) = session {
        let questions = sqlx::query_as::<_, Question>(
            "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
        )
        .bind(quiz_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let total_q_count = questions.len().max(1);

        if let Some(current_q) = questions.get(s.current_question_index as usize) {
            let answers = sqlx::query_as::<_, Answer>(
                "SELECT * FROM answers WHERE session_id = $1 AND question_id = $2",
            )
            .bind(session_id)
            .bind(current_q.id)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let participants = sqlx::query_as::<_, Participant>(
                "SELECT * FROM participants WHERE session_id = $1 ORDER BY correct_count DESC, name ASC",
            )
            .bind(session_id)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let mut correct_students = Vec::new();
            let mut incorrect_students = Vec::new();

            for ans in &answers {
                let p_name = participants
                    .iter()
                    .find(|p| p.id == ans.participant_id)
                    .map(|p| p.name.clone())
                    .unwrap_or_else(|| "Estudiante".to_string());

                if ans.is_correct {
                    correct_students.push(p_name);
                } else {
                    incorrect_students.push(p_name);
                }
            }

            let correct_count = correct_students.len();
            let incorrect_count = incorrect_students.len();

            // Build cumulative live leaderboard in real time
            let mut leaderboard: Vec<WsLeaderboardEntry> = participants
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    let score = ((p.correct_count as f64 / total_q_count as f64) * 5.0 * 10.0).round() / 10.0;
                    WsLeaderboardEntry {
                        rank: i + 1,
                        name: p.name.clone(),
                        score,
                        correct_count: p.correct_count as usize,
                    }
                })
                .collect();

            leaderboard.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
            for (i, entry) in leaderboard.iter_mut().enumerate() {
                entry.rank = i + 1;
            }

            let _ = tx.send(WsEvent::TeacherQuestionSummary {
                question_index: s.current_question_index as usize,
                total_answered: answers.len(),
                correct_count,
                incorrect_count,
                correct_students,
                incorrect_students,
                leaderboard,
            });
        }
    }
}

async fn broadcast_question_results(
    pool: &sqlx::PgPool,
    session_id: Uuid,
    quiz_id: Uuid,
    tx: &broadcast::Sender<WsEvent>,
) {
    let session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    if let Some(s) = session {
        let questions = sqlx::query_as::<_, Question>(
            "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
        )
        .bind(quiz_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        if let Some(current_q) = questions.get(s.current_question_index as usize) {
            let correct_opt = sqlx::query_as::<_, OptionItem>(
                "SELECT * FROM options WHERE question_id = $1 AND is_correct = TRUE",
            )
            .bind(current_q.id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

            // First broadcast updated teacher summary with live scores
            broadcast_live_answer_update(pool, session_id, quiz_id, tx).await;

            // Broadcast result to all students
            if let Some(corr) = correct_opt {
                let _ = tx.send(WsEvent::QuestionResult {
                    is_correct: false,
                    correct_option_id: Some(corr.id.to_string()),
                    correct_option_label: corr.label,
                    correct_option_text: corr.text,
                    user_option_label: None,
                });
            }
        }
    }
}

async fn finish_and_broadcast_results(
    pool: &sqlx::PgPool,
    session_id: Uuid,
    total_questions: usize,
    tx: &broadcast::Sender<WsEvent>,
) {
    let now = chrono::Utc::now();
    let _ = sqlx::query(
        "UPDATE sessions SET status = 'finished', finished_at = $1 WHERE id = $2",
    )
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await;

    // Get total questions in quiz
    let session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    let total_q = if let Some(ref s) = session {
        let count_res: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM questions WHERE quiz_id = $1"
        )
        .bind(s.quiz_id)
        .fetch_one(pool)
        .await
        .unwrap_or((total_questions.max(1) as i64,));
        count_res.0.max(1) as usize
    } else {
        total_questions.max(1)
    };

    // Calculate score out of 5.0 for all participants from actual answers table
    let participants = sqlx::query_as::<_, Participant>(
        "SELECT * FROM participants WHERE session_id = $1",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut leaderboard = Vec::new();

    for p in &participants {
        let correct_count_res: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM answers WHERE session_id = $1 AND participant_id = $2 AND is_correct = TRUE"
        )
        .bind(session_id)
        .bind(p.id)
        .fetch_one(pool)
        .await
        .unwrap_or((p.correct_count as i64,));

        let actual_correct = correct_count_res.0 as usize;
        let calculated_score = (actual_correct as f64 / total_q as f64) * 5.0;
        let final_score = (calculated_score * 10.0).round() / 10.0;

        let _ = sqlx::query(
            "UPDATE participants SET score = $1, correct_count = $2 WHERE id = $3",
        )
        .bind(final_score)
        .bind(actual_correct as i32)
        .bind(p.id)
        .execute(pool)
        .await;

        leaderboard.push(WsLeaderboardEntry {
            rank: 0,
            name: p.name.clone(),
            score: final_score,
            correct_count: actual_correct,
        });
    }

    // Sort leaderboard desc by score
    leaderboard.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    for (i, entry) in leaderboard.iter_mut().enumerate() {
        entry.rank = i + 1;
    }

    let _ = tx.send(WsEvent::QuizFinished {
        final_score: 5.0,
        correct_count: total_q,
        total_questions: total_q,
        leaderboard,
    });
}
