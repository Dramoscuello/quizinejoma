use crate::auth::AuthUser;
use crate::models::{Grade, Group, Participant, Quiz, Session};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

#[derive(Debug, Deserialize, Default)]
pub struct StartPlayRequest {
    #[serde(default)]
    pub group_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct StartPlayResponse {
    pub pin: String,
    pub session_id: Uuid,
    pub quiz_id: Uuid,
    pub quiz_title: String,
    pub grade_id: Uuid,
    pub grade_name: String,
    pub group_id: Option<Uuid>,
    pub group_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JoinSessionRequest {
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct JoinSessionResponse {
    pub valid: bool,
    pub session_id: Option<Uuid>,
    pub quiz_title: Option<String>,
    pub grade_name: Option<String>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct StudentJoinRequest {
    pub name: String,
}

// 1. Generate unique 4-digit numeric PIN
async fn generate_unique_pin(pool: &sqlx::PgPool) -> Result<String, sqlx::Error> {
    loop {
        let pin = {
            let mut rng = rand::thread_rng();
            format!("{:04}", rng.gen_range(1000..=9999))
        };

        let exists: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM sessions WHERE pin = $1 AND status NOT IN ('finished', 'cancelled')",
        )
        .bind(&pin)
        .fetch_optional(pool)
        .await?;

        if exists.is_none() {
            return Ok(pin);
        }
    }
}

// 2. Handler: Teacher starts a quiz (Generates unique 4-digit PIN)
#[axum::debug_handler]
pub async fn start_quiz_session_handler(
    _auth: AuthUser,
    Path(quiz_id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<StartPlayRequest>,
) -> impl IntoResponse {
    let group_id = payload.group_id;

    // Verify quiz exists
    let quiz = match sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
        .bind(quiz_id)
        .fetch_optional(&state.pool)
        .await
    {
        Ok(Some(q)) => q,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Evaluación no encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Error buscando evaluación: {}", e) })),
            )
                .into_response();
        }
    };

    // Verify grade exists
    let grade = sqlx::query_as::<_, Grade>("SELECT * FROM grades WHERE id = $1")
        .bind(quiz.grade_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let group = if let Some(gid) = group_id {
        sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id = $1")
            .bind(gid)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None)
    } else {
        None
    };

    // Generate unique 4-digit PIN
    let pin = match generate_unique_pin(&state.pool).await {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Error generando PIN único: {}", e) })),
            )
                .into_response();
        }
    };

    let session_id = Uuid::new_v4();

    let insert_res = sqlx::query(
        r#"
        INSERT INTO sessions (id, pin, quiz_id, grade_id, group_id, status, current_question_index)
        VALUES ($1, $2, $3, $4, $5, 'lobby', 0)
        "#,
    )
    .bind(session_id)
    .bind(&pin)
    .bind(quiz.id)
    .bind(quiz.grade_id)
    .bind(group_id)
    .execute(&state.pool)
    .await;

    match insert_res {
        Ok(_) => {
            let response = StartPlayResponse {
                pin,
                session_id,
                quiz_id: quiz.id,
                quiz_title: quiz.title,
                grade_id: quiz.grade_id,
                grade_name: grade.map(|g| g.name).unwrap_or_default(),
                group_id,
                group_name: group.map(|g| g.name),
            };
            (StatusCode::CREATED, Json(json!(response))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error creando sesión: {}", e) })),
        )
            .into_response(),
    }
}

// 3. Handler: Student validates PIN before entering name
pub async fn validate_pin_handler(
    State(state): State<AppState>,
    Json(payload): Json<JoinSessionRequest>,
) -> impl IntoResponse {
    let pin_trimmed = payload.pin.trim();

    let session = sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE pin = $1 AND status NOT IN ('finished', 'cancelled') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(pin_trimmed)
    .fetch_optional(&state.pool)
    .await;

    match session {
        Ok(Some(s)) => {
            let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
                .bind(s.quiz_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();

            let grade = sqlx::query_as::<_, Grade>("SELECT * FROM grades WHERE id = $1")
                .bind(s.grade_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();

            (
                StatusCode::OK,
                Json(json!(JoinSessionResponse {
                    valid: true,
                    session_id: Some(s.id),
                    quiz_title: quiz.map(|q| q.title),
                    grade_name: grade.map(|g| g.name),
                    status: s.status,
                })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::OK,
            Json(json!(JoinSessionResponse {
                valid: false,
                session_id: None,
                quiz_title: None,
                grade_name: None,
                status: "inactive".to_string(),
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error validando PIN: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn join_student_handler(
    Path(pin): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<StudentJoinRequest>,
) -> impl IntoResponse {
    let pin_trimmed = pin.trim();
    let name = payload.name.trim();

    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "El nombre no puede estar vacío" })),
        )
            .into_response();
    }

    let session = sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE pin = $1 AND status NOT IN ('finished', 'cancelled') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(pin_trimmed)
    .fetch_optional(&state.pool)
    .await;

    match session {
        Ok(Some(s)) => {
            let p_id = Uuid::new_v4();
            let res = sqlx::query_as::<_, Participant>(
                r#"
                INSERT INTO participants (id, session_id, name, score, correct_count)
                VALUES ($1, $2, $3, 0.0, 0)
                RETURNING *
                "#,
            )
            .bind(p_id)
            .bind(s.id)
            .bind(name)
            .fetch_one(&state.pool)
            .await;

            match res {
                Ok(participant) => {
                    // Trigger broadcast to room if active
                    let rooms = state.rooms.read().await;
                    if let Some(room) = rooms.get(pin_trimmed) {
                        let participants = sqlx::query_as::<_, Participant>(
                            "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at ASC",
                        )
                        .bind(s.id)
                        .fetch_all(&state.pool)
                        .await
                        .unwrap_or_default();

                        let ws_participants = participants
                            .iter()
                            .map(|p| crate::state::WsParticipant {
                                id: p.id.to_string(),
                                name: p.name.clone(),
                            })
                            .collect::<Vec<_>>();

                        let _ = room.sender.send(crate::state::WsEvent::LobbyUpdate {
                            count: ws_participants.len(),
                            participants: ws_participants,
                        });
                    }

                    (
                        StatusCode::CREATED,
                        Json(json!({
                            "participant": participant,
                            "session_id": s.id,
                        })),
                    )
                        .into_response()
                }
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Error registrando estudiante: {}", e) })),
                )
                    .into_response(),
            }
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Sesión no encontrada o inactiva" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error de base de datos: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn get_session_participants_handler(
    Path(pin): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let pin_trimmed = pin.trim();

    let session = sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE pin = $1 AND status NOT IN ('finished', 'cancelled') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(pin_trimmed)
    .fetch_optional(&state.pool)
    .await;

    match session {
        Ok(Some(s)) => {
            let participants = sqlx::query_as::<_, Participant>(
                "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at ASC",
            )
            .bind(s.id)
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();

            (StatusCode::OK, Json(json!(participants))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Sesión no encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo participantes: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn get_session_results_handler(
    Path(session_id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await;

    match session {
        Ok(Some(s)) => {
            let participants = sqlx::query_as::<_, Participant>(
                "SELECT * FROM participants WHERE session_id = $1 ORDER BY score DESC, correct_count DESC, name ASC",
            )
            .bind(s.id)
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();

            let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
                .bind(s.quiz_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();

            let grade = sqlx::query_as::<_, Grade>("SELECT * FROM grades WHERE id = $1")
                .bind(s.grade_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();

            let group = if let Some(gid) = s.group_id {
                sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id = $1")
                    .bind(gid)
                    .fetch_optional(&state.pool)
                    .await
                    .ok()
                    .flatten()
            } else {
                None
            };

            (
                StatusCode::OK,
                Json(json!({
                    "session": s,
                    "quiz_title": quiz.map(|q| q.title),
                    "grade_name": grade.map(|g| g.name),
                    "group_name": group.map(|g| g.name),
                    "participants": participants,
                })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Sesión no encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo resultados: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn list_sessions_history_handler(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let sessions = sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE status = 'finished' ORDER BY created_at DESC LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await;

    match sessions {
        Ok(list) => {
            let mut results = Vec::new();
            for s in list {
                let participants = sqlx::query_as::<_, Participant>(
                    "SELECT * FROM participants WHERE session_id = $1 ORDER BY score DESC, correct_count DESC, name ASC",
                )
                .bind(s.id)
                .fetch_all(&state.pool)
                .await
                .unwrap_or_default();

                let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
                    .bind(s.quiz_id)
                    .fetch_optional(&state.pool)
                    .await
                    .ok()
                    .flatten();

                let grade = sqlx::query_as::<_, Grade>("SELECT * FROM grades WHERE id = $1")
                    .bind(s.grade_id)
                    .fetch_optional(&state.pool)
                    .await
                    .ok()
                    .flatten();

                let group = if let Some(gid) = s.group_id {
                    sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id = $1")
                        .bind(gid)
                        .fetch_optional(&state.pool)
                        .await
                        .ok()
                        .flatten()
                } else {
                    None
                };

                let p_count = participants.len();

                results.push(json!({
                    "session": s,
                    "quiz_title": quiz.map(|q| q.title),
                    "grade_name": grade.map(|g| g.name),
                    "group_name": group.map(|g| g.name),
                    "participant_count": p_count,
                    "participants": participants,
                }));
            }

            (StatusCode::OK, Json(json!(results))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo historial: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_session_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let res = sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await;

    match res {
        Ok(r) => {
            if r.rows_affected() > 0 {
                (StatusCode::OK, Json(json!({ "success": true }))).into_response()
            } else {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "Registro de historial no encontrado" })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error eliminando registro de historial: {}", e) })),
        )
            .into_response(),
    }
}
