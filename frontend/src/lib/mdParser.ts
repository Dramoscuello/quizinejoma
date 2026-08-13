export interface ParsedOption {
  id: string;
  label: string; // 'A', 'B', 'C', 'D'
  text: string;
  isCorrect: boolean;
}

export interface ParsedQuestion {
  id: string;
  text: string;
  order: number;
  options: ParsedOption[];
}

export interface ParseResult {
  success: boolean;
  questions: ParsedQuestion[];
  errors: string[];
}

function generateSimpleUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseMarkdownQuiz(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];

  let currentQuestionText = "";
  let currentOptions: ParsedOption[] = [];
  let questionIndex = 0;

  const labels = ["A", "B", "C", "D", "E"];

  const commitCurrentQuestion = () => {
    if (!currentQuestionText.trim()) return;

    questionIndex++;
    if (currentOptions.length < 2) {
      errors.push(
        `Pregunta #${questionIndex} ("${currentQuestionText.slice(0, 30)}..."): Debe tener al menos 2 opciones.`
      );
    } else if (currentOptions.length > 5) {
      errors.push(`Pregunta #${questionIndex}: Máximo 4-5 opciones recomendadas.`);
    }

    const correctCount = currentOptions.filter((opt) => opt.isCorrect).length;
    if (correctCount === 0) {
      errors.push(
        `Pregunta #${questionIndex} ("${currentQuestionText.slice(0, 30)}..."): No tiene ninguna opción marcada como correcta con - [x] o - [ x ].`
      );
    } else if (correctCount > 1) {
      errors.push(
        `Pregunta #${questionIndex}: Tiene más de una opción correcta marcada.`
      );
    }

    questions.push({
      id: generateSimpleUUID(),
      text: currentQuestionText.trim(),
      order: questionIndex,
      options: [...currentOptions],
    });

    currentQuestionText = "";
    currentOptions = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // Detect question header: ## Question text or ### Question text or # Question text
    if (trimmed.startsWith("#")) {
      commitCurrentQuestion();
      currentQuestionText = trimmed.replace(/^#+\s*/, "").trim();
      continue;
    }

    // Detect options format: - [ ] text, - [x] text, -[ x ] text, - [ x ] text, * [x] text, etc.
    const optionMatch = trimmed.match(/^[-*+]?\s*\[\s*([xX]?)\s*\]\s*(.*)$/);
    if (optionMatch) {
      if (!currentQuestionText) {
        errors.push(
          `Línea ${i + 1}: Se encontró una opción antes de definir el título de la pregunta (usa ## Pregunta).`
        );
        continue;
      }

      const isCorrect = optionMatch[1].toLowerCase() === "x";
      const optionText = optionMatch[2].trim();
      const optionLabel = labels[currentOptions.length] || `Opt ${currentOptions.length + 1}`;

      currentOptions.push({
        id: generateSimpleUUID(),
        label: optionLabel,
        text: optionText,
        isCorrect,
      });
      continue;
    }

    // If it's another line under the question, append to question text if no options yet
    if (currentQuestionText && currentOptions.length === 0) {
      currentQuestionText += " " + trimmed;
    }
  }

  // Commit last question
  commitCurrentQuestion();

  if (questions.length === 0 && errors.length === 0) {
    errors.push(
      "No se encontraron preguntas válidas en el texto Markdown. Recuerda usar '## Pregunta' y '- [ ] Opción'."
    );
  }

  return {
    success: errors.length === 0 && questions.length > 0,
    questions,
    errors,
  };
}

export const sampleMarkdownQuiz = `## ¿Cuál es la capital de Colombia?
- [ ] Lima
- [ ] Quito
- [ x ] Bogotá
- [ ] Caracas

## ¿Cuánto es 12 x 8?
-[ ] 86
-[ x ] 96
-[ ] 104
-[ ] 98

## ¿Cuál es el planeta más grande del sistema solar?
- [ ] Marte
- [ ] Saturno
- [x] Júpiter
- [ ] Venus

## ¿En qué año llegó el hombre a la Luna?
- [ ] 1965
- [ x ] 1969
- [ ] 1972
- [ ] 1959
`;
