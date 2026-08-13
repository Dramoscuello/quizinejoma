use crate::auth::{create_jwt, verify_password};
use crate::models::{LoginRequest, LoginResponse, User};
use crate::state::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

pub async fn login_handler(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&payload.username)
        .fetch_optional(&state.pool)
        .await;

    match user {
        Ok(Some(u)) => {
            if verify_password(&payload.password, &u.password_hash) {
                match create_jwt(u.id, &u.username, &state.config.jwt_secret) {
                    Ok(token) => (
                        StatusCode::OK,
                        Json(json!(LoginResponse {
                            token,
                            username: u.username,
                        })),
                    )
                        .into_response(),
                    Err(e) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": format!("Error creando token JWT: {}", e) })),
                    )
                        .into_response(),
                }
            } else {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": "Credenciales inválidas" })),
                )
                    .into_response()
            }
        }
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Usuario no encontrado" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error en base de datos: {}", e) })),
        )
            .into_response(),
    }
}
