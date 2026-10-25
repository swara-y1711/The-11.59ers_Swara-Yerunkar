import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main


@pytest.fixture(autouse=True)
def clear_live_call_state():
    yield
    main.live_rooms.clear()
    main.available_investigators.clear()
    main.investigator_sessions.clear()
    main.live_call_requests.clear()
    main.live_call_by_socket.clear()
    main.signaling_tickets.clear()


def test_call_without_available_investigator_returns_immediately():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=caller") as caller:
            caller.send_json({"type": "request"})
            assert caller.receive_json() == {"type": "unavailable"}


def test_decline_notifies_caller_and_restores_investigator_availability():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()
                assert incoming["type"] == "incoming_call"

                investigator.send_json({
                    "type": "decline",
                    "request_id": incoming["request_id"],
                })
                assert caller.receive_json() == {"type": "declined"}
                assert investigator.receive_json() == {"type": "call_declined"}
                assert investigator.receive_json() == {"type": "available"}


def test_pending_call_cancellation_releases_investigator():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()
                caller.send_json({"type": "cancel"})
                assert caller.receive_json() == {"type": "ended"}
                assert caller.receive_json() == {"type": "cancelled"}
                assert investigator.receive_json() == {
                    "type": "call_cancelled",
                    "request_id": incoming["request_id"],
                }
                assert investigator.receive_json() == {"type": "available"}


def test_duplicate_request_on_same_connection_does_not_create_another_call():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()

                caller.send_json({"type": "request"})
                assert caller.receive_json() == {
                    "type": "error",
                    "message": "A call request is already active.",
                }
                assert incoming["type"] == "incoming_call"

                caller.send_json({"type": "cancel"})
                caller.receive_json()
                caller.receive_json()
                assert investigator.receive_json() == {
                    "type": "call_cancelled",
                    "request_id": incoming["request_id"],
                }
                assert investigator.receive_json() == {"type": "available"}


def test_unanswered_call_times_out(monkeypatch):
    monkeypatch.setattr(main, "CALL_REQUEST_TIMEOUT_SECONDS", 0.01)
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                investigator.receive_json()
                assert caller.receive_json()["type"] == "timeout"
                assert investigator.receive_json()["type"] == "call_cancelled"
                assert investigator.receive_json() == {"type": "available"}


def test_busy_investigator_does_not_receive_another_call():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as first_caller:
                first_caller.send_json({"type": "request"})
                assert first_caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()
                with client.websocket_connect("/ws/live-calls?role=caller") as second_caller:
                    second_caller.send_json({"type": "request"})
                    assert second_caller.receive_json() == {"type": "unavailable"}

                first_caller.send_json({"type": "cancel"})
                first_caller.receive_json()
                first_caller.receive_json()
                assert investigator.receive_json()["type"] == "call_cancelled"
                assert investigator.receive_json() == {"type": "available"}
                assert incoming["request_id"]


def test_investigator_disconnect_ends_pending_request():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=caller") as caller:
            caller.send_json({"type": "request"})
            assert caller.receive_json() == {"type": "unavailable"}
            with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
                assert investigator.receive_json() == {"type": "available"}
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                investigator.receive_json()
            assert caller.receive_json() == {"type": "unavailable"}


def test_investigator_end_notifies_caller_and_returns_to_available():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()
                investigator.send_json({
                    "type": "accept",
                    "request_id": incoming["request_id"],
                })
                assert caller.receive_json()["type"] == "accepted"
                assert investigator.receive_json()["type"] == "accepted"
                investigator.send_json({"type": "end"})
                assert caller.receive_json() == {"type": "ended"}
                assert investigator.receive_json() == {"type": "call_ended"}
                assert investigator.receive_json() == {"type": "available"}


def test_accept_issues_bound_one_time_signaling_tickets():
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/live-calls?role=investigator") as investigator:
            assert investigator.receive_json() == {"type": "available"}
            with client.websocket_connect("/ws/live-calls?role=caller") as caller:
                caller.send_json({"type": "request"})
                assert caller.receive_json() == {"type": "waiting"}
                incoming = investigator.receive_json()
                investigator.send_json({
                    "type": "accept",
                    "request_id": incoming["request_id"],
                })
                caller_session = caller.receive_json()
                investigator_session = investigator.receive_json()

                assert caller_session["type"] == "accepted"
                assert investigator_session["type"] == "accepted"
                assert caller_session["room"] == investigator_session["room"]
                assert caller_session["ticket"] != investigator_session["ticket"]

                room = caller_session["room"]
                caller_ticket = caller_session["ticket"]
                investigator_ticket = investigator_session["ticket"]
                with pytest.raises(WebSocketDisconnect) as unauthorized:
                    with client.websocket_connect(
                        f"/ws/signaling/{room}?role=investigator&ticket={caller_ticket}"
                    ):
                        pass
                assert unauthorized.value.code == 4401

                with client.websocket_connect(
                    f"/ws/signaling/{room}?role=caller&ticket={caller_ticket}"
                ) as caller_signal:
                    assert caller_signal.receive_json() == {
                        "type": "joined",
                        "role": "caller",
                        "peer_connected": False,
                    }
                    with pytest.raises(WebSocketDisconnect) as duplicate_ticket:
                        with client.websocket_connect(
                            f"/ws/signaling/{room}?role=caller&ticket={caller_ticket}"
                        ):
                            pass
                    assert duplicate_ticket.value.code == 4401

                    with client.websocket_connect(
                        f"/ws/signaling/{room}?role=investigator&ticket={investigator_ticket}"
                    ) as investigator_signal:
                        assert investigator_signal.receive_json() == {
                            "type": "joined",
                            "role": "investigator",
                            "peer_connected": True,
                        }
                        assert caller_signal.receive_json() == {
                            "type": "peer_joined",
                            "role": "investigator",
                        }
                        offer = {"type": "offer", "sdp": {"type": "offer", "sdp": "demo"}}
                        caller_signal.send_json(offer)
                        assert investigator_signal.receive_json() == offer
                        answer = {"type": "answer", "sdp": {"type": "answer", "sdp": "demo"}}
                        investigator_signal.send_json(answer)
                        assert caller_signal.receive_json() == answer
                        candidate = {
                            "type": "candidate",
                            "candidate": {"candidate": "demo-candidate"},
                        }
                        caller_signal.send_json(candidate)
                        assert investigator_signal.receive_json() == candidate
