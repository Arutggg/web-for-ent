"""
API-тесты ENT Math.

Запуск:  npm start  (в другом терминале)  →  pytest -v
Другой адрес:  BASE_URL=https://... pytest -v

Тест на rate limit стоит последним: он исчерпывает лимит отправки кода.
"""
import os

import pytest
import requests

BASE = os.getenv("BASE_URL", "http://localhost:3000").rstrip("/")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "test-secret")


def post(path, json=None, **kw):
    return requests.post(f"{BASE}{path}", json=json, timeout=10, **kw)


def get(path, **kw):
    return requests.get(f"{BASE}{path}", timeout=10, **kw)


# ---------- smoke ----------

def test_health():
    r = get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_landing_is_served():
    r = get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["Content-Type"]


def test_security_headers():
    """helmet должен выставлять базовые заголовки безопасности"""
    r = get("/api/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert "X-Powered-By" not in r.headers


# ---------- диагностика ----------

@pytest.mark.parametrize("exam, expected", [("ent", 17), ("ege", 21)])
def test_topics_count(exam, expected):
    r = get(f"/api/diagnostic/topics/{exam}")
    assert r.status_code == 200
    assert len(r.json()["topics"]) == expected


def test_questions_have_valid_structure():
    r = post("/api/diagnostic/questions", {"topicId": "equations", "count": 2})
    assert r.status_code == 200
    data = r.json()
    assert len(data["questions"]) == 2
    for q in data["questions"]:
        assert q["question"]
        assert len(q["options"]) == 4
        assert 0 <= q["correct"] < len(q["options"])


def test_questions_exclude_already_asked():
    first = post("/api/diagnostic/questions", {"topicId": "equations", "count": 1}).json()
    asked = first["questions"][0]["question"]
    second = post("/api/diagnostic/questions", {"topicId": "equations", "count": 3, "exclude": [asked]}).json()
    assert asked not in [q["question"] for q in second["questions"]]


def test_unknown_topic_returns_404():
    r = post("/api/diagnostic/questions", {"topicId": "astrology"})
    assert r.status_code == 404


def test_replenish_rejects_unknown_topic():
    r = post("/api/diagnostic/replenish", {"topicId": "astrology"})
    assert r.status_code == 400


def test_save_requires_fields():
    r = post("/api/diagnostic/save", {"sessionId": "abc"})
    assert r.status_code == 400


# ---------- граничные значения и валидация ----------

@pytest.mark.parametrize("body", [
    {},
    {"email": "user@mail.ru"},
    {"code": "123456"},
    {"email": "", "code": ""},
])
def test_verify_code_requires_email_and_code(body):
    r = post("/api/auth/verify-code", body)
    assert r.status_code == 400


def test_verify_code_wrong_code():
    r = post("/api/auth/verify-code", {"email": "user@mail.ru", "code": "000000"})
    assert r.status_code == 400


def test_payload_over_20kb_rejected():
    r = post("/api/diagnostic/questions", {"topicId": "equations", "pad": "x" * 25_000})
    assert r.status_code == 413


# ---------- доступ ----------

def test_admin_without_secret_is_401():
    assert get("/api/admin/data").status_code == 401


def test_admin_with_wrong_secret_is_401():
    assert get("/api/admin/data", headers={"x-admin-secret": "wrong"}).status_code == 401


def test_admin_with_secret_ok():
    r = get("/api/admin/data", headers={"x-admin-secret": ADMIN_SECRET})
    assert r.status_code == 200
    assert "diagnostic_results" in r.json()


def test_feedback_list_is_protected():
    assert get("/api/feedback").status_code == 403


# ---------- rate limiting (последним) ----------

def test_send_code_rate_limit():
    """Не больше 3 запросов кода за 10 минут: 4-й получает 429"""
    codes = [post("/api/auth/send-code", {"email": "bad-email"}).status_code for _ in range(4)]
    assert codes[:3] == [400, 400, 400]
    assert codes[3] == 429
