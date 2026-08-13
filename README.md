# 🎯 QuizInejoma

Plataforma interactiva de evaluaciones en tiempo real inspirada en Kahoot, diseñada para entornos educativos. Permite al docente crear evaluaciones por grados, lanzarlas con un PIN único y que los estudiantes respondan en vivo desde sus dispositivos.

---

## 📋 Tabla de Contenidos

- [Tecnologías](#-tecnologías)
- [Arquitectura](#-arquitectura)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Variables de Entorno](#-variables-de-entorno)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Base de Datos](#-base-de-datos)
- [Formato de Evaluaciones (.md)](#-formato-de-evaluaciones-md)
- [Flujo de la Aplicación](#-flujo-de-la-aplicación)
- [API Endpoints](#-api-endpoints)
- [WebSockets](#-websockets)
- [Sistema de Calificación](#-sistema-de-calificación)

---

## 🛠 Tecnologías

| Capa       | Tecnología     | Descripción                              |
|------------|----------------|------------------------------------------|
| Backend    | Rust + Axum    | API REST + WebSocket server              |
| Frontend   | Next.js        | Interfaz del docente y de los estudiantes |
| Base de Datos | PostgreSQL  | Persistencia de datos e historial        |
| Tiempo Real | WebSockets    | Comunicación bidireccional en vivo       |

---

## 🏗 Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    QuizInejoma                       │
│                                                     │
│  ┌──────────────┐          ┌──────────────────────┐ │
│  │   Frontend    │  HTTP/WS │      Backend         │ │
│  │   (Next.js)   │◄────────►│    (Rust + Axum)     │ │
│  │               │          │                      │ │
│  │  /            │          │  REST API            │ │
│  │  /login       │          │  WebSocket Server    │ │
│  │  /dashboard   │          │  Seed Service        │ │
│  │  /quiz/[pin]  │          │  MD Parser           │ │
│  └──────────────┘          └──────────┬───────────┘ │
│                                       │             │
│                            ┌──────────▼───────────┐ │
│                            │    PostgreSQL         │ │
│                            │                      │ │
│                            │  • users             │ │
│                            │  • grades            │ │
│                            │  • groups            │ │
│                            │  • quizzes           │ │
│                            │  • questions         │ │
│                            │  • options           │ │
│                            │  • sessions          │ │
│                            │  • participants      │ │
│                            │  • answers           │ │
│                            └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 📌 Requisitos Previos

- [Rust](https://www.rust-lang.org/tools/install) (última versión estable)
- [Node.js](https://nodejs.org/) (v18+)
- [PostgreSQL](https://www.postgresql.org/download/) (v14+)

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd QuizInejoma
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Levantar la base de datos

Asegúrate de que PostgreSQL esté corriendo y la base de datos especificada en `DATABASE_URL` exista.

```bash
createdb quizinejoma
```

### 4. Levantar el Backend

```bash
cd backend
cargo run
```

> 💡 La primera vez que se levanta el servicio, la función **seed** creará automáticamente el usuario administrador usando las credenciales `ADMIN_USER` y `ADMIN_PASSWORD` del archivo `.env`.

### 5. Levantar el Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🔐 Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Credenciales del Administrador (usadas por el seed)
ADMIN_USER=tu_usuario
ADMIN_PASSWORD=tu_password_seguro

# Base de Datos
DATABASE_URL=postgresql://usuario:password@localhost:5432/quizinejoma
```

> ⚠️ **El archivo `.env` contiene credenciales sensibles. Está incluido en `.gitignore` y nunca debe subirse al repositorio.**

---

## 📁 Estructura del Proyecto

```
QuizInejoma/
├── backend/                 # Servidor Rust + Axum
│   ├── src/
│   │   ├── main.rs          # Entry point + seed
│   │   ├── routes/          # Endpoints REST y WebSocket
│   │   ├── models/          # Modelos de datos
│   │   ├── handlers/        # Lógica de negocio
│   │   ├── db/              # Conexión y migraciones
│   │   ├── ws/              # Lógica de WebSockets
│   │   └── parser/          # Parser de archivos .md
│   ├── Cargo.toml
│   └── Cargo.lock
│
├── frontend/                # Aplicación Next.js
│   ├── src/
│   │   ├── app/             # Rutas y páginas
│   │   ├── components/      # Componentes reutilizables
│   │   └── lib/             # Utilidades y WebSocket client
│   ├── package.json
│   └── next.config.js
│
├── .env                     # Variables de entorno (no versionado)
├── .env.example             # Plantilla de variables de entorno
├── .gitignore
└── README.md
```

---

## 🗄 Base de Datos

### Diagrama Entidad-Relación

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  grades  │────<│  groups   │     │   quizzes    │
│          │     │           │     │              │
│  id      │     │  id       │     │  id          │
│  name    │     │  name     │     │  title       │
│          │     │  grade_id │     │  grade_id    │
└────┬─────┘     └───────────┘     │  time_limit  │
     │                             └──────┬───────┘
     │                                    │
     └────────────────────────────────────┘
                                          │
                              ┌───────────▼──────────┐
                              │     questions        │
                              │                      │
                              │  id                  │
                              │  quiz_id             │
                              │  text                │
                              │  order               │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │      options         │
                              │                      │
                              │  id                  │
                              │  question_id         │
                              │  text                │
                              │  is_correct          │
                              │  label (A, B, C, D)  │
                              └──────────────────────┘

┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│   sessions   │────<│ participants   │────<│   answers    │
│              │     │                │     │              │
│  id          │     │  id            │     │  id          │
│  quiz_id     │     │  session_id    │     │  participant │
│  group_id    │     │  name          │     │  question_id │
│  pin (4 dig) │     │  final_score   │     │  option_id   │
│  status      │     │                │     │  is_correct  │
│  created_at  │     └────────────────┘     │  answered_at │
└──────────────┘                            └──────────────┘
```

### Estados de una sesión (`sessions.status`)

| Estado       | Descripción                                      |
|--------------|--------------------------------------------------|
| `lobby`      | Esperando que los estudiantes se unan             |
| `playing`    | Quiz en progreso, mostrando preguntas             |
| `reviewing`  | Mostrando resultados de la pregunta actual         |
| `finished`   | Todas las preguntas fueron respondidas             |

---

## 📝 Formato de Evaluaciones (.md)

Las evaluaciones se crean pegando contenido en formato Markdown. El parser interpreta automáticamente las preguntas, opciones y respuestas correctas.

### Formato esperado

```md
## ¿Cuál es la capital de Colombia?

- [ ] Lima
- [ ] Quito
- [x] Bogotá
- [ ] Caracas

## ¿Cuánto es 2 + 2?

- [ ] 3
- [x] 4
- [ ] 5

## ¿En qué año se descubrió América?

- [ ] 1400
- [ ] 1500
- [x] 1492
- [ ] 1510
```

### Reglas del parser

| Regla | Descripción |
|-------|-------------|
| `## Texto` | Define una nueva pregunta |
| `- [ ] Texto` | Opción de respuesta incorrecta |
| `- [x] Texto` | Opción de respuesta **correcta** (solo una por pregunta) |
| Opciones por pregunta | Mínimo 3, máximo 4 |
| Labels automáticos | Se asignan A, B, C, D en orden de aparición |

---

## 🔄 Flujo de la Aplicación

### Vista del Docente

```
/login
  │
  ▼
/dashboard
  │
  ├── Crear/Ver Grados
  │     │
  │     ├── Crear/Ver Grupos dentro del Grado
  │     │
  │     └── Crear/Ver Evaluaciones del Grado
  │           │
  │           ├── Pegar .md → Parser interpreta y guarda
  │           │
  │           └── ▶ Play → Genera PIN de 4 dígitos
  │                 │
  │                 ▼
  │           Lobby (ver contador + nombres)
  │                 │
  │                 ▼ Iniciar
  │           Pregunta activa
  │           (ver quién acierta/falla en tiempo real)
  │                 │
  │                 ▼ Siguiente pregunta...
  │           Resultados finales
  │           (listado de estudiantes con nota /5.0)
  │
  └── Historial de sesiones anteriores
```

### Vista del Estudiante

```
/ (Inicio)
  │
  ▼
Ingresa PIN de 4 dígitos (input tipo OTP)
  │
  ▼ PIN válido y activo
Ingresa su nombre
  │
  ▼
Lobby (esperando que el docente inicie)
  │
  ▼ El docente inicia
Pregunta + opciones (temporizador visible)
  │
  ├── Responde → Pantalla de espera
  │                 │
  │                 ▼ Todos respondieron o se acabó el tiempo
  │              Resultado: ✅ Correcto / ❌ Incorrecto
  │              (muestra la respuesta correcta)
  │
  └── No responde a tiempo → Se envía como respuesta nula (incorrecta)
  │
  ▼ Siguiente pregunta...
Nota final (sobre 5.0) + botón Finalizar → Redirige a /
```

---

## 📡 API Endpoints

### Autenticación

| Método | Ruta         | Descripción                    |
|--------|--------------|--------------------------------|
| POST   | `/api/login` | Inicio de sesión del docente   |

### Grados

| Método | Ruta              | Descripción              |
|--------|--------------------|--------------------------|
| GET    | `/api/grades`      | Listar grados            |
| POST   | `/api/grades`      | Crear grado              |
| PUT    | `/api/grades/:id`  | Editar grado             |
| DELETE | `/api/grades/:id`  | Eliminar grado           |

### Grupos

| Método | Ruta                          | Descripción              |
|--------|-------------------------------|--------------------------|
| GET    | `/api/grades/:id/groups`      | Listar grupos del grado  |
| POST   | `/api/grades/:id/groups`      | Crear grupo              |
| PUT    | `/api/groups/:id`             | Editar grupo             |
| DELETE | `/api/groups/:id`             | Eliminar grupo           |

### Evaluaciones (Quizzes)

| Método | Ruta                           | Descripción                           |
|--------|--------------------------------|---------------------------------------|
| GET    | `/api/grades/:id/quizzes`      | Listar evaluaciones del grado         |
| POST   | `/api/grades/:id/quizzes`      | Crear evaluación (enviar .md en body) |
| GET    | `/api/quizzes/:id`             | Ver detalle de evaluación             |
| PUT    | `/api/quizzes/:id`             | Editar evaluación                     |
| DELETE | `/api/quizzes/:id`             | Eliminar evaluación                   |

### Sesiones de juego

| Método | Ruta                            | Descripción                         |
|--------|---------------------------------|-------------------------------------|
| POST   | `/api/quizzes/:id/play`         | Iniciar sesión (genera PIN)         |
| POST   | `/api/sessions/join`            | Validar PIN del estudiante          |
| GET    | `/api/sessions/:id/results`     | Obtener resultados finales          |
| GET    | `/api/sessions/history`         | Historial de sesiones anteriores    |

---

## 🔌 WebSockets

La comunicación en tiempo real se maneja a través de WebSockets para las siguientes interacciones:

### Conexión

```
ws://localhost:<port>/ws/session/:pin
```

### Eventos

#### Docente → Servidor

| Evento             | Descripción                                |
|--------------------|--------------------------------------------|
| `start_quiz`       | Iniciar la evaluación desde el lobby       |
| `next_question`    | Avanzar a la siguiente pregunta            |
| `end_quiz`         | Finalizar la evaluación manualmente        |

#### Servidor → Docente

| Evento                | Descripción                                          |
|-----------------------|------------------------------------------------------|
| `participant_joined`  | Un estudiante se unió al lobby                       |
| `participant_count`   | Actualización del contador de participantes          |
| `answer_received`     | Un estudiante respondió                              |
| `question_results`    | Resultados de la pregunta (aciertos/errores)         |
| `final_results`       | Listado final con notas                              |

#### Servidor → Estudiante

| Evento                | Descripción                                          |
|-----------------------|------------------------------------------------------|
| `waiting`             | Esperando en el lobby                                |
| `question`            | Nueva pregunta con opciones y temporizador           |
| `wait_for_others`     | Respuesta registrada, esperando a los demás          |
| `question_result`     | Si acertó o falló + respuesta correcta               |
| `final_score`         | Nota final sobre 5.0                                 |
| `time_up`             | Se acabó el tiempo para la pregunta actual           |

#### Estudiante → Servidor

| Evento                | Descripción                                          |
|-----------------------|------------------------------------------------------|
| `join`                | Unirse a la sesión con nombre                        |
| `submit_answer`       | Enviar respuesta seleccionada                        |

---

## 📊 Sistema de Calificación

La nota máxima es **5.0** y se calcula proporcionalmente al número de respuestas correctas:

```
nota = (respuestas_correctas / total_preguntas) * 5.0
```

### Ejemplo

| Preguntas | Correctas | Nota |
|-----------|-----------|------|
| 10        | 10        | 5.0  |
| 10        | 7         | 3.5  |
| 10        | 0         | 0.0  |
| 4         | 3         | 3.75 |

### Reglas del temporizador

- Cada pregunta tiene **30 segundos** por defecto.
- El tiempo es configurable por evaluación al momento de crearla o editarla.
- Si el estudiante **no responde** antes de que se acabe el tiempo, la respuesta se registra como **nula e incorrecta**.
- Cuando **todos los estudiantes responden** o el **tiempo se agota**, se revelan los resultados de la pregunta.

---

## 🔒 Seguridad

- Las credenciales del docente se crean mediante la función **seed** al primer arranque.
- Las contraseñas se almacenan hasheadas (bcrypt/argon2).
- Los endpoints del docente están protegidos por autenticación JWT.
- Los estudiantes **no requieren cuenta**, solo PIN + nombre.
- Cada sesión genera un PIN **único y aleatorio** de 4 dígitos.

---

> **QuizInejoma** — Evaluaciones interactivas en tiempo real 🚀
