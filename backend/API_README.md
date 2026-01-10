# FrameOps API

Turn any video into a professional Standard Operating Procedure (SOP) with AI.

## Quick Start

### 1. Get your API key
Visit [frameops.com/dashboard](https://frameops.com/dashboard) and create an API key.

### 2. Make your first request

```bash
curl -X POST https://frameops-production.up.railway.app/api/v1/generate-sop \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "youtube_url": "https://www.youtube.com/watch?v=YOUR_VIDEO_ID",
    "title": "My Procedure",
    "detail_level": "normal"
  }'
```

## Authentication

All API requests require an API key. Include it in your request headers:

```
X-API-Key: your_api_key_here
```

Or as a query parameter:
```
?api_key=your_api_key_here
```

## Endpoints

### Generate SOP from YouTube Video

```
POST /api/v1/generate-sop
```

**Request Body:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Optional Custom Title",
  "detail_level": "normal",
  "include_images": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| youtube_url | string | Yes | YouTube video URL |
| title | string | No | Custom title (auto-generated if not provided) |
| detail_level | string | No | `quick` (6-12 steps), `normal` (12-25), `detailed` (25-50) |
| include_images | boolean | No | Include base64 images in response (default: true) |

**Response:**
```json
{
  "success": true,
  "sop": {
    "id": "sop_abc123",
    "title": "How to Change Car Oil",
    "description": "Complete guide to changing motor oil...",
    "steps": [
      {
        "step_number": 1,
        "title": "Prepare the vehicle",
        "description": "Park on a level surface and engage the parking brake...",
        "timestamp": "00:15",
        "image_base64": "data:image/jpeg;base64,..."
      }
    ],
    "ppe_requirements": ["Safety glasses", "Gloves"],
    "materials_required": ["Oil filter", "5W-30 oil", "Drain pan"]
  }
}
```

### Analyze Your Own Frames

```
POST /api/v1/analyze-frames
```

Upload your own images to generate an SOP.

**Request Body:**
```json
{
  "frames": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  ],
  "title": "Assembly Procedure",
  "context": "Optional additional context or transcript"
}
```

### Get Usage Statistics

```
GET /api/v1/usage
```

**Response:**
```json
{
  "plan": "pro",
  "requests_this_month": 142,
  "requests_limit": 10000,
  "reset_date": "2025-02-01T00:00:00Z"
}
```

### Health Check

```
GET /api/v1/health
```

No authentication required.

## Rate Limits

| Plan | Requests/Month | Rate Limit |
|------|----------------|------------|
| Free | 100 | 10/minute |
| Pro | 10,000 | 60/minute |
| Enterprise | Unlimited | Custom |

Rate limit headers are included in every response:
```
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9858
X-RateLimit-Reset: 2025-02-01T00:00:00Z
```

## Error Handling

All errors return JSON with `error` and `message` fields:

```json
{
  "error": "rate_limit_exceeded",
  "message": "You have exceeded your monthly quota"
}
```

| HTTP Code | Error | Description |
|-----------|-------|-------------|
| 400 | invalid_request | Missing or invalid parameters |
| 401 | unauthorized | Invalid or missing API key |
| 429 | rate_limit_exceeded | Too many requests |
| 500 | internal_error | Server error |

## Code Examples

### Python

```python
import requests

API_KEY = "your_api_key"
BASE_URL = "https://frameops-production.up.railway.app/api/v1"

def generate_sop(youtube_url, title=None):
    response = requests.post(
        f"{BASE_URL}/generate-sop",
        headers={"X-API-Key": API_KEY},
        json={
            "youtube_url": youtube_url,
            "title": title,
            "detail_level": "normal"
        }
    )
    return response.json()

# Example usage
result = generate_sop("https://youtube.com/watch?v=example")
print(f"Generated {len(result['sop']['steps'])} steps")
```

### JavaScript/Node.js

```javascript
const API_KEY = 'your_api_key';
const BASE_URL = 'https://frameops-production.up.railway.app/api/v1';

async function generateSOP(youtubeUrl, title) {
  const response = await fetch(`${BASE_URL}/generate-sop`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      youtube_url: youtubeUrl,
      title: title,
      detail_level: 'normal'
    })
  });
  return response.json();
}

// Example usage
generateSOP('https://youtube.com/watch?v=example')
  .then(result => console.log(`Generated ${result.sop.steps.length} steps`));
```

### Zapier Integration

1. Use **Webhooks by Zapier** → **POST**
2. URL: `https://frameops-production.up.railway.app/api/v1/generate-sop`
3. Headers: `X-API-Key: your_api_key`
4. Body Type: JSON
5. Data:
```json
{
  "youtube_url": "{{your_youtube_url_field}}",
  "title": "{{your_title_field}}"
}
```

## Webhooks (Coming Soon)

Configure webhooks to receive notifications when:
- SOP generation completes
- Monthly usage reaches 80%
- API key is about to expire

## Support

- Documentation: [frameops.com/api/docs](https://frameops.com/api/docs)
- Email: api@frameops.com
- Discord: [discord.gg/frameops](https://discord.gg/frameops)

## Changelog

### v1.0.0 (2025-01-10)
- Initial public API release
- YouTube video to SOP generation
- Frame analysis endpoint
- Usage tracking and rate limiting
