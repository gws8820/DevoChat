from openai import OpenAI

client = OpenAI(
 api_key="fw_3ZmzVqRbyEaA2Z2cKXt9N1Yk",
 base_url="https://api.fireworks.ai/inference/v1",
)

response = client.chat.completions.create(
 messages=[
     {
         "role": "user",
         "content": "Say this is a test",
     }
 ],
 # notice the change in the model name
 model="accounts/fireworks/models/llama-v3p3-70b-instruct",
)

print(response.choices[0].message.content)