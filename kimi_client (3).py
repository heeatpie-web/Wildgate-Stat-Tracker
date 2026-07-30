import sys
from openai import OpenAI

# TODO: confirm this is the real HTTP endpoint (should end in /v1)
# If `modal deploy` printed a *.modal.run URL, use that instead of modal.direct
BASE_URL = "https://heeatpie-web--ep-kimi-k3-server.us-west.modal.direct/v1"

MODAL_TOKEN_ID = "wk-mQbMty0jG91siz7DyMAisa"
MODAL_TOKEN_SECRET = "ws-e45GZhE5xkPiurp2S7XlbS"

client = OpenAI(
    base_url=BASE_URL,
    api_key="not-needed",  # real auth happens via headers below
    default_headers={
        "Modal-Key": MODAL_TOKEN_ID,
        "Modal-Secret": MODAL_TOKEN_SECRET,
    },
)

conversation_history = [
    {
        "role": "system",
        "content": "You are Kimi K3, a helpful and hyper-intelligent AI assistant running on Modal serverless infrastructure."
    }
]

print("====================================================")
print("Kimi K3 Terminal Active (type 'exit' to quit)")
print("====================================================\n")

while True:
    try:
        user_input = input("User > ").strip()

        if user_input.lower() in ["exit", "quit"]:
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        conversation_history.append({"role": "user", "content": user_input})
        print("\nKimi > ", end="", flush=True)

        response = client.chat.completions.create(
            model="kimi-k3",
            messages=conversation_history,
            temperature=0.5,
            stream=True,
        )

        full_response = ""
        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                print(delta.content, end="", flush=True)
                full_response += delta.content

        print("\n")
        conversation_history.append({"role": "assistant", "content": full_response})

    except KeyboardInterrupt:
        print("\n\nChat interrupted. Exiting...")
        break
    except Exception as e:
        print(f"\nConnection Error: {type(e).__name__}: {e}\n")
