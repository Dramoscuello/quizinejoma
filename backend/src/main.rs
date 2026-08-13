mod auth;
mod config;
mod db;
mod handlers;
mod models;
mod parser;
mod state;
mod ws;

use axum::{
    http::{header, Method},
    routing::{delete, get, post, put},
    Json, Router,
};
use config::Config;
use db::{init_db_pool, seed_database};
use handlers::{
    auth::login_handler,
    grades::{create_grade_handler, delete_grade_handler, list_grades_handler, update_grade_handler},
    groups::{
        create_group_handler, delete_group_handler, list_groups_by_grade_handler, update_group_handler,
    },
    quizzes::{
        create_quiz_handler, delete_quiz_handler, get_quiz_handler, list_quizzes_by_grade_handler,
        update_quiz_handler,
    },
    sessions::{
        delete_session_handler, get_session_participants_handler, get_session_results_handler,
        join_student_handler, list_sessions_history_handler, start_quiz_session_handler,
        validate_pin_handler,
    },
};
use serde_json::json;
use state::AppState;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use ws::ws_session_handler;

async fn health_check() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "QuizInejoma Backend",
        "version": "0.1.0"
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. Initialize Logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "quizinejoma_backend=debug,tower_http=info,axum=trace".into()),
        )
        .init();

    info!("🚀 Iniciando servidor QuizInejoma Backend...");

    // 2. Load Configuration
    let config = Config::from_env();

    // 3. Connect to Database & Run Seed
    let pool = init_db_pool(&config.database_url).await?;
    seed_database(&pool, &config).await?;

    // 4. Create App State
    let app_state = AppState::new(pool, config.clone());

    // 5. Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]);

    // 6. Define Routes
    let app = Router::new()
        .route("/health", get(health_check))
        // Auth
        .route("/api/login", post(login_handler))
        // Grades
        .route("/api/grades", get(list_grades_handler).post(create_grade_handler))
        .route(
            "/api/grades/:id",
            put(update_grade_handler).delete(delete_grade_handler),
        )
        // Groups
        .route(
            "/api/grades/:id/groups",
            get(list_groups_by_grade_handler).post(create_group_handler),
        )
        .route(
            "/api/groups/:id",
            put(update_group_handler).delete(delete_group_handler),
        )
        // Quizzes & Smart Markdown Parser
        .route(
            "/api/grades/:id/quizzes",
            get(list_quizzes_by_grade_handler).post(create_quiz_handler),
        )
        .route(
            "/api/quizzes/:id",
            get(get_quiz_handler)
                .put(update_quiz_handler)
                .delete(delete_quiz_handler),
        )
        // Live Sessions & Game Play
        .route("/api/quizzes/:id/play", post(start_quiz_session_handler))
        .route("/api/sessions/join", post(validate_pin_handler))
        .route("/api/sessions/:pin/join", post(join_student_handler))
        .route("/api/sessions/:pin/participants", get(get_session_participants_handler))
        .route("/api/sessions/:id/results", get(get_session_results_handler))
        .route("/api/sessions/history", get(list_sessions_history_handler))
        .route("/api/sessions/:id", delete(delete_session_handler))
        // Real-time WebSockets
        .route("/ws/session/:pin", get(ws_session_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    // 7. Bind & Serve
    let addr = SocketAddr::new(
        config.host.parse().unwrap_or([0, 0, 0, 0].into()),
        config.port,
    );

    info!("⚡ QuizInejoma Backend corriendo en http://{}", addr);
    info!("🔌 WebSocket endpoint disponible en ws://{}/ws/session/:pin", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
