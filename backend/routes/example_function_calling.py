import asyncio
import os
import sys
import json
from dotenv import load_dotenv
from google import genai

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MODEL = "gemini-3-flash-preview"

TOOLS = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "특정 도시의 현재 날씨 정보를 반환합니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "날씨를 조회할 도시 이름"}
            },
            "required": ["city"]
        }
    },
    {
        "type": "function",
        "name": "convert_currency",
        "description": "두 통화 간 환율 변환을 수행합니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "amount": {"type": "number", "description": "변환할 금액"},
                "from_currency": {"type": "string", "description": "변환 전 통화 코드 (예: USD, KRW, EUR, JPY)"},
                "to_currency": {"type": "string", "description": "변환 후 통화 코드 (예: USD, KRW, EUR, JPY)"}
            },
            "required": ["amount", "from_currency", "to_currency"]
        }
    }
]

def get_weather(city: str) -> str:
    weather_db = {
        "서울": "맑음, 기온 15°C, 습도 45%",
        "부산": "구름 많음, 기온 18°C, 습도 62%",
        "도쿄": "흐림, 기온 13°C, 습도 70%",
        "뉴욕": "비, 기온 8°C, 습도 85%",
    }
    return weather_db.get(city, f"부분적으로 흐림, 기온 12°C, 습도 55%")

def convert_currency(amount: float, from_currency: str, to_currency: str) -> str:
    rates = {"USD": 1.0, "KRW": 1350.0, "EUR": 0.92, "JPY": 149.0}
    from_c = from_currency.upper()
    to_c = to_currency.upper()
    if from_c not in rates or to_c not in rates:
        return f"지원하지 않는 통화 코드입니다. 지원 통화: {', '.join(rates.keys())}"
    result = amount / rates[from_c] * rates[to_c]
    return f"{amount:,.2f} {from_c} = {result:,.2f} {to_c}"

FUNCTION_MAP = {
    "get_weather": get_weather,
    "convert_currency": convert_currency,
}

async def run_chat(user_input: str):
    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

    print(f"사용자: {user_input}")
    print(f"\nGemini: ", end="", flush=True)

    # 1단계: function_call 감지 (non-streaming)
    interaction = await client.aio.interactions.create(
        model=MODEL,
        input=user_input,
        tools=TOOLS,
        generation_config={"thinking_level": "low"}
    )

    function_results = []
    has_function_call = any(o.type == "function_call" for o in interaction.outputs)

    if not has_function_call:
        # function call 없이 바로 텍스트 응답이 온 경우 스트리밍으로 출력
        text = next((o.text for o in interaction.outputs if o.type == "text"), "")
        for i in range(0, len(text), 5):
            sys.stdout.write(text[i:i+5])
            sys.stdout.flush()
            await asyncio.sleep(0.02)
        print()
        return

    # 2단계: function 실행
    for output in interaction.outputs:
        if output.type == "function_call":
            func = FUNCTION_MAP.get(output.name)
            if not func:
                continue

            args_str = json.dumps(output.arguments, ensure_ascii=False)
            print(f"\n  [도구 호출] {output.name}({args_str})", flush=True)

            result = func(**output.arguments)
            print(f"  [도구 결과] {result}", flush=True)

            function_results.append({
                "type": "function_result",
                "name": output.name,
                "call_id": output.id,
                "result": result
            })

    print(f"\nGemini: ", end="", flush=True)

    # 3단계: function 결과 포함해서 streaming으로 최종 응답
    stream = await client.aio.interactions.create(
        model=MODEL,
        previous_interaction_id=interaction.id,
        input=function_results,
        tools=TOOLS,
        generation_config={"thinking_level": "low"},
        stream=True
    )

    async for chunk in stream:
        if chunk.event_type == "content.delta":
            delta = getattr(chunk, 'delta', None)
            if delta and getattr(delta, 'type', None) == 'text' and getattr(delta, 'text', None):
                sys.stdout.write(delta.text)
                sys.stdout.flush()

    print()


if __name__ == "__main__":
    user_input = "서울이랑 부산 날씨 알려줘. 그리고 100달러가 한국 돈으로 얼마야?"
    asyncio.run(run_chat(user_input))
