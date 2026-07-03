#!/bin/bash

echo "Testing Auth API..."
echo "-------------------"

# 1. Login
echo "1. POST /api/v1/auth/token"
RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -H "X-Madrasa: suffa" \
  -d '{"username": "admin", "password": "password123"}')
echo $RESPONSE
TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo -e "\n\n2. GET /api/v1/auth/me"
curl -s -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Madrasa: suffa"

echo -e "\n\nTesting Academics API..."
echo "------------------------"
echo "3. GET /api/v1/academics/programs"
curl -s -X GET http://localhost:8000/api/v1/academics/programs \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Madrasa: suffa"

echo -e "\n\nDone!"
