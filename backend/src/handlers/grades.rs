use crate::auth::AuthUser;
use crate::models::{CreateGradeRequest, Grade};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

pub async fn list_grades_handler(State(state): State<AppState>) -> impl IntoResponse {
    let grades = sqlx::query_as::<_, Grade>("SELECT * FROM grades ORDER BY name ASC")
        .fetch_all(&state.pool)
        .await;

    match grades {
        Ok(list) => (StatusCode::OK, Json(json!(list))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo grados: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn create_grade_handler(
    _auth: AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateGradeRequest>,
) -> impl IntoResponse {
    let id = Uuid::new_v4();
    let res = sqlx::query_as::<_, Grade>(
        "INSERT INTO grades (id, name, description) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&payload.description)
    .fetch_one(&state.pool)
    .await;

    match res {
        Ok(grade) => (StatusCode::CREATED, Json(json!(grade))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error creando grado: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn update_grade_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<CreateGradeRequest>,
) -> impl IntoResponse {
    let res = sqlx::query_as::<_, Grade>(
        "UPDATE grades SET name = $1, description = $2 WHERE id = $3 RETURNING *",
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(id)
    .fetch_optional(&state.pool)
    .await;

    match res {
        Ok(Some(grade)) => (StatusCode::OK, Json(json!(grade))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Grado no encontrado" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error actualizando grado: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_grade_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let res = sqlx::query("DELETE FROM grades WHERE id = $1")
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
                    Json(json!({ "error": "Grado no encontrado" })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error eliminando grado: {}", e) })),
        )
            .into_response(),
    }
}
