use crate::auth::AuthUser;
use crate::models::{CreateGroupRequest, Group};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

pub async fn list_groups_by_grade_handler(
    Path(grade_id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let groups = sqlx::query_as::<_, Group>(
        "SELECT * FROM groups WHERE grade_id = $1 ORDER BY name ASC",
    )
    .bind(grade_id)
    .fetch_all(&state.pool)
    .await;

    match groups {
        Ok(list) => (StatusCode::OK, Json(json!(list))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error obteniendo grupos: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn create_group_handler(
    _auth: AuthUser,
    Path(grade_id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<CreateGroupRequest>,
) -> impl IntoResponse {
    let id = Uuid::new_v4();
    let count = payload.student_count.unwrap_or(0);

    let res = sqlx::query_as::<_, Group>(
        "INSERT INTO groups (id, grade_id, name, student_count) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(id)
    .bind(grade_id)
    .bind(&payload.name.trim())
    .bind(count)
    .fetch_one(&state.pool)
    .await;

    match res {
        Ok(group) => (StatusCode::CREATED, Json(json!(group))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error creando grupo: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn update_group_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<CreateGroupRequest>,
) -> impl IntoResponse {
    let count = payload.student_count.unwrap_or(0);

    let res = sqlx::query_as::<_, Group>(
        "UPDATE groups SET name = $1, student_count = $2 WHERE id = $3 RETURNING *",
    )
    .bind(&payload.name.trim())
    .bind(count)
    .bind(id)
    .fetch_optional(&state.pool)
    .await;

    match res {
        Ok(Some(group)) => (StatusCode::OK, Json(json!(group))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Grupo no encontrado" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error actualizando grupo: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_group_handler(
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let res = sqlx::query("DELETE FROM groups WHERE id = $1")
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
                    Json(json!({ "error": "Grupo no encontrado" })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error eliminando grupo: {}", e) })),
        )
            .into_response(),
    }
}
