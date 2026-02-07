#!/bin/bash

# Test script for VaporForge conversation continuity
# Tests that Claude Agent SDK maintains conversation memory across messages

set -e

API_BASE="https://vaporforge.jbcloud.app/api"

echo "🧪 VaporForge Conversation Continuity Test"
echo "=========================================="
echo

# Step 1: Check if we have a Claude OAuth token
if [ -z "$CLAUDE_TOKEN" ]; then
  echo "❌ Error: CLAUDE_TOKEN environment variable not set"
  echo "   Run: export CLAUDE_TOKEN='your-sk-ant-oat01-token'"
  echo "   Get token from: claude setup-token"
  exit 1
fi

echo "✓ Claude token found: ${CLAUDE_TOKEN:0:20}..."
echo

# Step 2: Authenticate with VaporForge
echo "📡 Step 1: Authenticating with VaporForge..."
AUTH_RESPONSE=$(curl -s -X POST "$API_BASE/auth/setup" \
  -H "Content-Type: application/json" \
  -d "{\"setupToken\": \"$CLAUDE_TOKEN\"}")

SESSION_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.data.token // empty')

if [ -z "$SESSION_TOKEN" ]; then
  echo "❌ Authentication failed:"
  echo "$AUTH_RESPONSE" | jq '.'
  exit 1
fi

echo "✓ Authenticated successfully"
echo

# Step 3: Create a session
echo "📡 Step 2: Creating sandbox session..."
SESSION_RESPONSE=$(curl -s -X POST "$API_BASE/sessions/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"name": "Conversation Test"}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Session creation failed:"
  echo "$SESSION_RESPONSE" | jq '.'
  exit 1
fi

echo "✓ Session created: $SESSION_ID"
echo

# Step 4: Send first message (establish memory)
echo "📡 Step 3: Sending first message (establishing memory)..."
echo "   Message: 'Remember this: bananas are yellow. Just acknowledge.'"
echo

MSG1_RESPONSE=$(curl -s -X POST "$API_BASE/chat/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"Remember this: bananas are yellow. Just acknowledge.\"
  }")

MSG1_CONTENT=$(echo "$MSG1_RESPONSE" | jq -r '.data.content // empty')

if [ -z "$MSG1_CONTENT" ]; then
  echo "❌ First message failed:"
  echo "$MSG1_RESPONSE" | jq '.'
  exit 1
fi

echo "✓ Claude responded:"
echo "   $MSG1_CONTENT"
echo

# Step 5: Wait a moment
sleep 2

# Step 6: Send second message (test memory)
echo "📡 Step 4: Sending second message (testing memory)..."
echo "   Message: 'What color are bananas?'"
echo

MSG2_RESPONSE=$(curl -s -X POST "$API_BASE/chat/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"What color are bananas?\"
  }")

MSG2_CONTENT=$(echo "$MSG2_RESPONSE" | jq -r '.data.content // empty')

if [ -z "$MSG2_CONTENT" ]; then
  echo "❌ Second message failed:"
  echo "$MSG2_RESPONSE" | jq '.'
  exit 1
fi

echo "✓ Claude responded:"
echo "   $MSG2_CONTENT"
echo

# Step 7: Verify memory
if echo "$MSG2_CONTENT" | grep -qi "yellow"; then
  echo "✅ SUCCESS: Conversation continuity working!"
  echo "   Claude remembered that bananas are yellow."
else
  echo "❌ FAILURE: Conversation continuity NOT working"
  echo "   Claude did not remember the previous context."
  exit 1
fi

echo
echo "🎉 All tests passed!"
