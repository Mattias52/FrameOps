const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FrameOps API',
      version: '1.0.0',
      description: `
# FrameOps API

Turn any video into a professional Standard Operating Procedure (SOP) with AI.

## Authentication

All API endpoints require an API key. Include it in your requests:

\`\`\`
X-API-Key: your_api_key_here
\`\`\`

## Rate Limits

| Plan | Requests/Month | Rate |
|------|----------------|------|
| Free | 100 | 10/min |
| Pro | 10,000 | 60/min |
| Enterprise | Unlimited | Custom |

## Quick Start

1. Get your API key at [frameops.com/dashboard](https://frameops.com/dashboard)
2. Make your first request:

\`\`\`bash
curl -X POST https://api.frameops.com/api/v1/generate-sop \\
  -H "X-API-Key: your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"youtube_url": "https://youtube.com/watch?v=xxx"}'
\`\`\`
      `,
      contact: {
        name: 'FrameOps Support',
        url: 'https://frameops.com/support',
        email: 'api@frameops.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'https://frameops-production.up.railway.app',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Your FrameOps API key'
        }
      },
      schemas: {
        SOP: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique SOP identifier' },
            title: { type: 'string', description: 'SOP title' },
            description: { type: 'string', description: 'Executive summary' },
            steps: {
              type: 'array',
              items: { $ref: '#/components/schemas/Step' }
            },
            ppe_requirements: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required personal protective equipment'
            },
            materials_required: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required materials and tools'
            },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Step: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            step_number: { type: 'integer' },
            title: { type: 'string', description: 'Step title' },
            description: { type: 'string', description: 'Detailed instructions' },
            timestamp: { type: 'string', description: 'Video timestamp (MM:SS)' },
            image_base64: { type: 'string', description: 'Base64 encoded frame image' },
            safety_warnings: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        GenerateSOPRequest: {
          type: 'object',
          required: ['youtube_url'],
          properties: {
            youtube_url: {
              type: 'string',
              description: 'YouTube video URL',
              example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            },
            title: {
              type: 'string',
              description: 'Custom title (optional, auto-generated if not provided)',
              example: 'How to Change Car Oil'
            },
            detail_level: {
              type: 'string',
              enum: ['quick', 'normal', 'detailed'],
              default: 'normal',
              description: 'Level of detail for generated steps'
            },
            include_images: {
              type: 'boolean',
              default: true,
              description: 'Include base64 images in response'
            }
          }
        },
        AnalyzeFramesRequest: {
          type: 'object',
          required: ['frames'],
          properties: {
            frames: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of base64 encoded images'
            },
            title: {
              type: 'string',
              description: 'Procedure title'
            },
            context: {
              type: 'string',
              description: 'Additional context or transcript'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error code' },
            message: { type: 'string', description: 'Human-readable error message' },
            details: { type: 'object', description: 'Additional error details' }
          }
        },
        UsageStats: {
          type: 'object',
          properties: {
            requests_this_month: { type: 'integer' },
            requests_limit: { type: 'integer' },
            plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
            reset_date: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    security: [{ ApiKeyAuth: [] }]
  },
  apis: ['./routes/*.js', './index.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
