use crate::auth::hash_password;
use crate::config::Config;
use crate::models::User;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tracing::info;
use uuid::Uuid;

pub async fn init_db_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    info!("Conectando a la base de datos PostgreSQL...");
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    run_migrations(&pool).await.map_err(|e| {
        sqlx::Error::Configuration(format!("Error en migraciones: {}", e).into())
    })?;

    Ok(pool)
}

async fn run_migrations(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    info!("Ejecutando migraciones automáticas...");

    let statements = [
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS grades (
            id UUID PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS groups (
            id UUID PRIMARY KEY,
            grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            student_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS quizzes (
            id UUID PRIMARY KEY,
            grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            time_limit_seconds INT NOT NULL DEFAULT 30,
            markdown_content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS questions (
            id UUID PRIMARY KEY,
            quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            order_index INT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS options (
            id UUID PRIMARY KEY,
            question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            label VARCHAR(10) NOT NULL,
            text TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
            id UUID PRIMARY KEY,
            pin VARCHAR(10) NOT NULL,
            quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
            group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'lobby',
            current_question_index INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS participants (
            id UUID PRIMARY KEY,
            session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            correct_count INT NOT NULL DEFAULT 0,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS answers (
            id UUID PRIMARY KEY,
            session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            option_id UUID REFERENCES options(id) ON DELETE SET NULL,
            is_correct BOOLEAN NOT NULL DEFAULT FALSE,
            time_taken_seconds INT NOT NULL DEFAULT 0,
            answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_session_part_quest ON answers (session_id, participant_id, question_id)
        "#,
    ];

    for stmt in statements {
        sqlx::query(stmt).execute(pool).await?;
    }

    info!("Migraciones completadas exitosamente.");
    Ok(())
}

pub async fn seed_database(pool: &PgPool, config: &Config) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Seed ONLY the Admin User (no grades, no groups, no quizzes)
    let existing_user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&config.admin_user)
        .fetch_optional(pool)
        .await?;

    if existing_user.is_none() {
        info!("Ejecutando Seed: Creando usuario Administrador '{}'...", config.admin_user);
        let password_hash = hash_password(&config.admin_password)
            .map_err(|e| format!("Error hasheando contraseña seed: {}", e))?;

        let user_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)"
        )
        .bind(user_id)
        .bind(&config.admin_user)
        .bind(&password_hash)
        .execute(pool)
        .await?;
        info!("Usuario Administrador creado exitosamente.");
    }

    Ok(())
}
