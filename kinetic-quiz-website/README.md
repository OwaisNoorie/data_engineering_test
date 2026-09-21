# Kinetic Quiz — Uploadable Question-Bank Assessment Website

A zero-backend quiz website inspired by the supplied screenshots.

## Features

- Upload `.docx` or `.json` question banks.
- Extract questions/options in the browser.
- 60-minute countdown timer.
- Progress bar and question navigator.
- Four assessment modes:
  - Full Final Assessment
  - Through DBT
  - Snowflake Certification
  - DBT Intensive
- Automatic scoring and percentage.
- Detailed answer-by-answer review.
- Correct/wrong/unanswered breakdown.
- Best score stored locally.
- Notes library for DOCX, TXT, MD and JSON. PDF files are accepted as references; browser-only text extraction is intentionally not included.
- Searchable local notes.
- Sample question bank and JSON template.
- No backend required.

## Run

Because this is a static site, the simplest option is:

1. Unzip.
2. Open `index.html` in a browser.

For a local development server (recommended):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## JSON format

```json
{
  "questions": [
    {
      "question": "What is Snowpipe?",
      "options": [
        "Continuous data loading",
        "A BI tool",
        "A database",
        "A compiler"
      ],
      "answer": 0,
      "explanation": "Snowpipe provides continuous, automated loading.",
      "topic": "Snowflake",
      "difficulty": "Medium",
      "tags": ["snowflake"]
    }
  ]
}
```

`answer` is zero-based: `0=A, 1=B, 2=C, 3=D`.

The importer also accepts `correctAnswer`, `correct`, `answerIndex`, `choices`, and `data/items` wrappers.

## DOCX format

The DOCX parser looks for patterns such as:

Q1. What is Snowpipe?
A. ...
B. ...
C. ...
D. ...
Answer: A
Explanation: ...

It can also handle `1.`, `2)`, etc.

## Data

All question banks, notes and recent scores are stored in the browser's localStorage. Clearing site data clears them.

## Production upgrade ideas

For multi-user use, add a backend/database, authentication, server-side file parsing, PDF text extraction, question-bank tagging, admin dashboard, analytics, and cloud storage.
