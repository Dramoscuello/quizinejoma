use crate::config::Config;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsEvent {
    // Client -> Server
    StudentJoin { name: String },
    TeacherStartQuiz,
    StudentSubmitAnswer {
        #[serde(default)]
        question_id: Option<String>,
        #[serde(default)]
        option_id: Option<String>,
        #[serde(default)]
        time_taken_seconds: Option<i32>,
    },
    TeacherRevealResults,
    TeacherNextQuestion,
    TeacherEndQuiz,
    TeacherCancelQuiz,

    // Server -> Client
    LobbyUpdate { participants: Vec<WsParticipant>, count: usize },
    QuestionStarted {
        #[serde(default)]
        question_id: Option<String>,
        question_index: usize,
        total_questions: usize,
        text: String,
        time_limit_seconds: i32,
        options: Vec<WsOptionPublic>,
    },
    WaitingForOthers,
    QuestionResult {
        is_correct: bool,
        #[serde(default)]
        correct_option_id: Option<String>,
        correct_option_label: String,
        correct_option_text: String,
        #[serde(default)]
        user_option_label: Option<String>,
    },
    TeacherQuestionSummary {
        question_index: usize,
        total_answered: usize,
        correct_count: usize,
        incorrect_count: usize,
        correct_students: Vec<String>,
        incorrect_students: Vec<String>,
        #[serde(default)]
        leaderboard: Vec<WsLeaderboardEntry>,
    },
    QuizFinished {
        final_score: f64, // out of 5.0
        correct_count: usize,
        total_questions: usize,
        leaderboard: Vec<WsLeaderboardEntry>,
    },
    QuizCancelled { message: String },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsOptionPublic {
    pub id: String,
    pub label: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsParticipant {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsLeaderboardEntry {
    pub rank: usize,
    pub name: String,
    pub score: f64,
    pub correct_count: usize,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct ActiveRoom {
    pub pin: String,
    pub session_id: Uuid,
    pub quiz_id: Uuid,
    pub sender: broadcast::Sender<WsEvent>,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub rooms: Arc<RwLock<HashMap<String, ActiveRoom>>>,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        Self {
            pool,
            config,
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
