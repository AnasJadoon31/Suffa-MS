import asyncio
import httpx
from app.core.config import settings

async def test():
    base_url = settings.evolution_api_url.strip().rstrip("/")
    api_key = settings.evolution_api_key.strip()
    headers = {"apikey": api_key}
    
    async with httpx.AsyncClient() as client:
        # Get instances to find one
        res = await client.get(f"{base_url}/instance/fetchInstances", headers=headers)
        instances = res.json()
        print("Instances:", instances)
        if not instances: return
        instance = instances[0]['instance']['instanceName']
        
        # Test chat/whatsappNumbers
        res = await client.post(f"{base_url}/chat/whatsappNumbers/{instance}", headers=headers, json={"numbers": ["923001234567"]})
        print("whatsappNumbers:", res.status_code, res.text)
        
        # Test chat/checkNumber
        res = await client.post(f"{base_url}/chat/checkNumber/{instance}", headers=headers, json={"numbers": ["923001234567"]})
        print("checkNumber (POST):", res.status_code, res.text)

asyncio.run(test())
