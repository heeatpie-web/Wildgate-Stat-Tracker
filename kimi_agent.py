import json
import subprocess
import os
from openai import OpenAI

BASE_URL = "https://heeatpie-web--ep-kimi-k3-server.us-west.modal.direct/v1"
MODAL_TOKEN_ID = "wk-mQbMty0jG91siz7DyMAisa"
MODAL_TOKEN_SECRET = "ws-e45GZhE5xkPiurp2S7XlbS"

client = OpenAI(
    base_url=BASE_URL,
    api_key="not-needed",
    default_headers={
        "Modal-Key": MODAL_TOKEN_ID,
        "Modal-Secret": MODAL_TOKEN_SECRET,
    },
)

# ---- token-saving knobs ----
MAX_TOOL_OUTPUT_CHARS = 1500   # truncate anything huge (build logs, big files)
MAX_HISTORY_MESSAGES = 20      # drop oldest turns once history gets long
SYSTEM_PROMPT = (
    "You are a coding agent. Use tools to read/write files and run shell "
    "commands. Be terse. No filler, no re-explaining what you already did. "
    "Only output prose when giving a final answer or asking a question."
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write (overwrite) a file with given content",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command and return stdout+stderr",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "List files in a directory",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "default": "."}},
            },
        },
    },
]


def truncate(s: str) -> str:
    if len(s) > MAX_TOOL_OUTPUT_CHARS:
        return s[:MAX_TOOL_OUTPUT_CHARS] + f"\n...[truncated, {len(s)} chars total]"
    return s


def call_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":
            with open(args["path"], "r", errors="replace") as f:
                return truncate(f.read())
        elif name == "write_file":
            os.makedirs(os.path.dirname(args["path"]) or ".", exist_ok=True)
            with open(args["path"], "w") as f:
                f.write(args["content"])
            return f"wrote {len(args['content'])} chars to {args['path']}"
        elif name == "run_command":
            result = subprocess.run(
                args["command"], shell=True, capture_output=True,
                text=True, timeout=60,
            )
            out = result.stdout + result.stderr
            return truncate(out) or "(no output)"
        elif name == "list_dir":
            path = args.get("path", ".")
            return "\n".join(os.listdir(path))
        else:
            return f"unknown tool: {name}"
    except Exception as e:
        return f"error: {e}"


def prune_history(history):
    # keep system prompt + most recent N messages
    if len(history) > MAX_HISTORY_MESSAGES:
        return [history[0]] + history[-(MAX_HISTORY_MESSAGES - 1):]
    return history


def run_turn(history):
    while True:
        history[:] = prune_history(history)
        response = client.chat.completions.create(
            model="kimi-k3",
            messages=history,
            tools=TOOLS,
            temperature=0.2,
        )
        msg = response.choices[0].message
        history.append(msg.model_dump(exclude_none=True))

        if not msg.tool_calls:
            print(f"\nKimi > {msg.content}\n")
            return

        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            print(f"  [{tc.function.name}] {args}")
            result = call_tool(tc.function.name, args)
            history.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })


def main():
    history = [{"role": "system", "content": SYSTEM_PROMPT}]
    print("Kimi K3 agent. 'exit' to quit.\n")
    while True:
        try:
            user_input = input("User > ").strip()
        except (KeyboardInterrupt, EOFError):
            break
        if user_input.lower() in ("exit", "quit"):
            break
        if not user_input:
            continue
        history.append({"role": "user", "content": user_input})
        try:
            run_turn(history)
        except Exception as e:
            print(f"Connection Error: {type(e).__name__}: {e}\n")


if __name__ == "__main__":
    main()
