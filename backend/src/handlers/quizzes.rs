use crate::auth::AuthUser;
use crate::models::{CreateQuizRequest, OptionItem, Question, QuestionWithOptions, Quiz, QuizDetailResponse};
use crate::parser::parse_markdown_quiz;
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

pub async fn list_quizzes_by_grade_handler(
    Path(grade_id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let quizzes = sqlx::query_as::<_, Quiz>(
        "SELECT * FROM quizzes WHERE grade_id = $1 ORDER BY created_at DESC",
    )
    .bind(grade_id)
    .fetch_all(&state.pool)
    .await;

    match quizzes {
        Ok(list) => {
            let mut full_list = Vec::new();
            for q in list {
                let questions = sqlx::query_as::<_, Question>(
                    "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
                )
                .bind(q.id)
                .fetch_all(&state.pool)
                .await
                .unwrap_or_default();

                let mut q_with_opts = Vec::new();
                for question in questions {
                    let options = sqlx::query_as::<_, OptionItem>(
                        "SELECT * FROM options WHERE question_id = $1 ORDER BY label ASC",
                    )
                    .bind(question.id)
                    .fetch_all(&state.pool)
                    .await
                    .unwrap_or_default();

                    q_with_opts.push(QuestionWithOptions {
                        id: question.id,
                        text: question.text,
                        order_index: question.order_index,
                        options,
                    });
                }

                full_list.push(QuizDetailResponse {
                    quiz: q,
                    questions: q_with_opts,
                });
            }

            (StatusCode::OK, Json(json!(full_list))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo quizzes: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn get_quiz_handler(
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let quiz = sqlx::query_as::<_, Quiz>("SELECT * FROM quizzes WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await;

    match quiz {
        Ok(Some(q)) => {
            let questions = sqlx::query_as::<_, Question>(
                "SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC",
            )
            .bind(q.id)
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();

            let mut q_with_opts = Vec::new();
            for question in questions {
                let options = sqlx::query_as::<_, OptionItem>(
                    "SELECT * FROM options WHERE question_id = $1 ORDER BY label ASC",
                )
                .bind(question.id)
                .fetch_all(&state.pool)
                .await
                .unwrap_or_default();

                q_with_opts.push(QuestionWithOptions {
                    id: question.id,
                    text: question.text,
                    order_index: question.order_index,
                    options,
                });
            }

            (
                StatusCode::OK,
                Json(json!(QuizDetailResponse {
                    quiz: q,
                    questions: q_with_opts,
                })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Evaluación no encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo evaluación: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn create_quiz_handler(
    _auth: AuthUser,
    Path(grade_id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<CreateQuizRequest>,
) -> impl IntoResponse {
    // 1. Smart Markdown Parse
    let parsed = parse_markdown_quiz(&payload.markdown_content);
    if !parsed.success || parsed.questions.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Error interpretando formato Markdown",
                "details": parsed.errors
            })),
        )
            .into_response();
    }

    let quiz_id = Uuid::new_v4();
    let time_limit = payload.time_limit_seconds.unwrap_or(30);

    // 2. Insert Quiz
    let quiz_res = sqlx::query_as::<_, Quiz>(
        r#"
        INSERT INTO quizzes (id, grade_id, title, time_limit_seconds, markdown_content)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(quiz_id)
    .bind(grade_id)
    .bind(&payload.title)
    .bind(time_limit)
    .bind(&payload.markdown_content)
    .fetch_one(&state.pool)
    .await;

    match quiz_res {
        Ok(quiz) => {
            // 3. Insert parsed Questions & Options
            let mut q_with_opts = Vec::new();
            for q in parsed.questions {
                let q_id = Uuid::new_v4();
                let _ = sqlx::query(
                    "INSERT INTO questions (id, quiz_id, text, order_index) VALUES ($1, $2, $3, $4)"
                )
                .bind(q_id)
                .bind(quiz_id)
                .bind(&q.text)
                .bind(q.order_index)
                .execute(&state.pool)
                .await;

                let mut saved_opts = Vec::new();
                for opt in q.options {
                    let opt_id = Uuid::new_v4();
                    let opt_res = sqlx::query_as::<_, OptionItem>(
                        r#"
                        INSERT INTO options (id, question_id, label, text, is_correct)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                        "#,
                    )
                    .bind(opt_id)
                    .bind(q_id)
                    .bind(&opt.label)
                    .bind(&opt.text)
                    .bind(opt.is_correct)
                    .fetch_one(&state.pool)
                    .await;

                    if let Ok(o) = opt_res {
                        saved_opts.push(o);
                    }
                }

                q_with_opts.push(QuestionWithOptions {
                    id: q_id,
                    text: q.text,
                    order_index: q.order_index,
                    options: saved_opts,
                });
            }

            (
                StatusCode::CREATED,
                Json(json!(QuizDetailResponse {
                    quiz,
                    questions: q_with_opts,
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error guardando evaluación: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn update_quiz_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<CreateQuizRequest>,
) -> impl IntoResponse {
    let parsed = parse_markdown_quiz(&payload.markdown_content);
    if !parsed.success || parsed.questions.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Error interpretando formato Markdown",
                "details": parsed.errors
            })),
        )
            .into_response();
    }

    let time_limit = payload.time_limit_seconds.unwrap_or(30);

    let res = sqlx::query_as::<_, Quiz>(
        r#"
        UPDATE quizzes 
        SET title = $1, time_limit_seconds = $2, markdown_content = $3
        WHERE id = $4
        RETURNING *
        "#,
    )
    .bind(&payload.title)
    .bind(time_limit)
    .bind(&payload.markdown_content)
    .bind(id)
    .fetch_optional(&state.pool)
    .await;

    match res {
        Ok(Some(quiz)) => {
            // Delete old questions (cascades to options)
            let _ = sqlx::query("DELETE FROM questions WHERE quiz_id = $1")
                .bind(id)
                .execute(&state.pool)
                .await;

            let mut q_with_opts = Vec::new();
            for q in parsed.questions {
                let q_id = Uuid::new_v4();
                let _ = sqlx::query(
                    "INSERT INTO questions (id, quiz_id, text, order_index) VALUES ($1, $2, $3, $4)"
                )
                .bind(q_id)
                .bind(id)
                .bind(&q.text)
                .bind(q.order_index)
                .execute(&state.pool)
                .await;

                let mut saved_opts = Vec::new();
                for opt in q.options {
                    let opt_id = Uuid::new_v4();
                    let opt_res = sqlx::query_as::<_, OptionItem>(
                        r#"
                        INSERT INTO options (id, question_id, label, text, is_correct)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                        "#,
                    )
                    .bind(opt_id)
                    .bind(q_id)
                    .bind(&opt.label)
                    .bind(&opt.text)
                    .bind(opt.is_correct)
                    .fetch_one(&state.pool)
                    .await;

                    if let Ok(o) = opt_res {
                        saved_opts.push(o);
                    }
                }

                q_with_opts.push(QuestionWithOptions {
                    id: q_id,
                    text: q.text,
                    order_index: q.order_index,
                    options: saved_opts,
                });
            }

            (
                StatusCode::OK,
                Json(json!(QuizDetailResponse {
                    quiz,
                    questions: q_with_opts,
                })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Evaluación no encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error actualizando evaluación: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_quiz_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let res = sqlx::query("DELETE FROM quizzes WHERE id = $1")
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
                    Json(json!({ "error": "Evaluación no encontrada" })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error eliminando evaluación: {}", e) })),
        )
            .into_response(),
    }
}
