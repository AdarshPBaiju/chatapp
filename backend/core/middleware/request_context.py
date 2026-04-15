import threading

_thread_locals = threading.local()

def get_current_session_id() -> str | None:
    """
    Retrieve the session ID associated with the current thread/request.
    """
    return getattr(_thread_locals, "session_id", None)

def set_current_session_id(session_id: str | None) -> None:
    """
    Store the session ID associated with the current thread/request.
    """
    _thread_locals.session_id = session_id

class SessionContextMiddleware:
    """
    Middleware that extracts the session_id (sid) from the authenticated request
    and stores it in thread-local storage for access in signals or services.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # We rely on the fact that DRF authentication has already run
        # (or will run) and attached the payload to request.auth.
        # However, at the middleware level (__call__), DRF auth might not have run yet.
        # We'll use a lazy approach or extract it if the header is present and we can decode it easily.

        # Reset at the start of request
        set_current_session_id(None)

        response = self.get_response(request)

        # Clean up after request
        set_current_session_id(None)
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        # DRF views might have initialized the auth by now if they were called via dispatch
        # but the standard way is to wait for the view to be called.
        # We'll update this in the Authentication backend for most accuracy.
        return None
