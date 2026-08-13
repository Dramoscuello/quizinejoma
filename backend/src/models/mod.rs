use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Grade {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Group {
    pub id: Uuid,
    pub grade_id: Uuid,
    pub name: String,
    pub student_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Quiz {
    pub id: Uuid,
    pub grade_id: Uuid,
    pub title: String,
    pub time_limit_seconds: i32,
    pub markdown_content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Question {
    pub id: Uuid,
    pub quiz_id: Uuid,
    pub text: String,
    pub order_index: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OptionItem {
    pub id: Uuid,
    pub question_id: Uuid,
    pub label: String, // 'A', 'B', 'C', 'D'
    pub text: String,
    pub is_correct: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: Uuid,
    pub pin: String,
    pub quiz_id: Uuid,
    pub grade_id: Uuid,
    pub group_id: Option<Uuid>,
    pub status: String, // "lobby", "playing", "reviewing", "finished"
    pub current_question_index: i32,
    pub created_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Participant {
    pub id: Uuid,
    pub session_id: Uuid,
    pub name: String,
    pub score: f64, // out of 5.0
    pub correct_count: i32,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Answer {
    pub id: Uuid,
    pub session_id: Uuid,
    pub participant_id: Uuid,
    pub question_id: Uuid,
    pub option_id: Option<Uuid>,
    pub is_correct: bool,
    pub time_taken_seconds: i32,
    pub answered_at: DateTime<Utc>,
}

// Request and Response DTOs
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateGradeRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub student_count: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateQuizRequest {
    pub title: String,
    pub time_limit_seconds: Option<i32>,
    pub markdown_content: String,
}

#[derive(Debug, Serialize)]
pub struct QuizDetailResponse {
    #[serde(flatten)]
    pub quiz: Quiz,
    pub questions: Vec<QuestionWithOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionWithOptions {
    pub id: Uuid,
    pub text: String,
    pub order_index: i32,
    pub options: Vec<OptionItem>,
}
