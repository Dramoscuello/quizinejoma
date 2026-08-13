use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedOption {
    pub label: String, // 'A', 'B', 'C', 'D'
    pub text: String,
    pub is_correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestion {
    pub text: String,
    pub order_index: i32,
    pub options: Vec<ParsedOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub success: bool,
    pub questions: Vec<ParsedQuestion>,
    pub errors: Vec<String>,
}

pub fn parse_markdown_quiz(markdown: &str) -> ParseResult {
    let lines = markdown.lines();
    let mut questions: Vec<ParsedQuestion> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    let mut current_question_text = String::new();
    let mut current_options: Vec<ParsedOption> = Vec::new();
    let mut question_index = 0;

    let labels = ["A", "B", "C", "D", "E"];

    let commit_question = |q_text: &mut String,
                           opts: &mut Vec<ParsedOption>,
                           q_list: &mut Vec<ParsedQuestion>,
                           errs: &mut Vec<String>,
                           idx: &mut i32| {
        let trimmed_text = q_text.trim();
        if trimmed_text.is_empty() {
            return;
        }

        *idx += 1;
        if opts.len() < 2 {
            errs.push(format!(
                "Pregunta #{} ('{}...'): Debe tener al menos 2 opciones de respuesta.",
                *idx,
                trimmed_text.chars().take(25).collect::<String>()
            ));
        } else if opts.len() > 5 {
            errs.push(format!("Pregunta #{}: Máximo 4-5 opciones permitidas.", *idx));
        }

        let correct_count = opts.iter().filter(|o| o.is_correct).count();
        if correct_count == 0 {
            errs.push(format!(
                "Pregunta #{} ('{}...'): No tiene ninguna opción marcada como correcta con - [x] o - [ x ].",
                *idx,
                trimmed_text.chars().take(25).collect::<String>()
            ));
        } else if correct_count > 1 {
            errs.push(format!(
                "Pregunta #{}: Tiene más de una opción correcta marcada.",
                *idx
            ));
        }

        q_list.push(ParsedQuestion {
            text: trimmed_text.to_string(),
            order_index: *idx,
            options: opts.clone(),
        });

        q_text.clear();
        opts.clear();
    };

    for (line_num, raw_line) in lines.enumerate() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Header: # Question or ## Question or ### Question
        if trimmed.starts_with('#') {
            commit_question(
                &mut current_question_text,
                &mut current_options,
                &mut questions,
                &mut errors,
                &mut question_index,
            );
            current_question_text = trimmed.trim_start_matches('#').trim().to_string();
            continue;
        }

        // Option detector: support -, *, +, or direct [x], [ x ], [  x  ], -[ x ], - [ x ]
        if let Some(bracket_start) = trimmed.find('[') {
            let prefix = trimmed[..bracket_start].trim();
            if prefix.is_empty() || prefix == "-" || prefix == "*" || prefix == "+" {
                if let Some(bracket_end_rel) = trimmed[bracket_start..].find(']') {
                    let actual_end = bracket_start + bracket_end_rel;
                    let inside = trimmed[bracket_start + 1..actual_end].trim().to_lowercase();
                    
                    let is_correct = inside.contains('x');
                    let option_text = trimmed[actual_end + 1..].trim().to_string();

                    if current_question_text.is_empty() {
                        errors.push(format!(
                            "Línea {}: Se encontró una opción antes del título de la pregunta (usa ## Pregunta).",
                            line_num + 1
                        ));
                        continue;
                    }

                    let label = labels
                        .get(current_options.len())
                        .copied()
                        .unwrap_or("X")
                        .to_string();

                    current_options.push(ParsedOption {
                        label,
                        text: option_text,
                        is_correct,
                    });
                    continue;
                }
            }
        }

        // If it's extra text for the question
        if !current_question_text.is_empty() && current_options.is_empty() {
            current_question_text.push(' ');
            current_question_text.push_str(trimmed);
        }
    }

    // Commit last question
    commit_question(
        &mut current_question_text,
        &mut current_options,
        &mut questions,
        &mut errors,
        &mut question_index,
    );

    if questions.is_empty() && errors.is_empty() {
        errors.push("No se encontraron preguntas válidas en el texto Markdown. Usa formato '## Pregunta' y '- [ ] Opción'.".to_string());
    }

    ParseResult {
        success: errors.is_empty() && !questions.is_empty(),
        questions,
        errors,
    }
}
