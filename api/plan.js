// Función serverless (Vercel): POST /api/plan  { mode, input }  → respuesta en streaming.
import { handlePlanRequest } from '../lib/handler.js';

export async function POST(request) {
  return handlePlanRequest(request);
}
