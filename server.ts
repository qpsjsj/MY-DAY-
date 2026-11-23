import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '512kb' }));

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const VALID_INTENTS = [
  'schedule_action',
  'todo_action',
  'design_change',
  'widget_config',
  'widget_create',
  'schedule_analysis',
  'unsupported',
] as const;

const VALID_OPS = [
  'add_schedule',
  'update_schedule',
  'delete_schedule',
  'add_todo',
  'split_todo',
  'delete_todo',
  'move_unfinished_todos',
  'toggle_todo',
  'update_design',
  'toggle_widget',
  'create_custom_widget',
  'add_dday',
  'add_expense',
  'add_habit',
  'add_note',
] as const;

const aiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [...VALID_INTENTS],
      description:
        'Must be one of: schedule_action, todo_action, design_change, widget_config, widget_create, schedule_analysis, unsupported',
    },
    intentLabel: {
      type: Type.STRING,
      description:
        'Korean label such as 일정 추가 또는 수정, 할 일 관리, 디자인 변경, 위젯 설정, 새 위젯 생성, 일정 분석 및 추천, 지원하지 않는 요청',
    },
    requiresConfirmation: {
      type: Type.BOOLEAN,
      description:
        'True if deleting items, modifying multiple schedules, creating a multi-day study plan, or adding a brand new custom widget that changes dashboard layout significantly.',
    },
    explanation: {
      type: Type.STRING,
      description:
        'Concise Korean explanation of the proposed or pending action using future/present phrasing (e.g., "... 일정을 등록합니다", not "... 등록했습니다"). Never claim unimplemented features were done.',
    },
    previewSummary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Bullet list of concrete actions or suggestions in Korean.',
    },
    operations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          op: {
            type: Type.STRING,
            enum: [...VALID_OPS],
            description:
              'One of: add_schedule, update_schedule, delete_schedule, add_todo, split_todo, delete_todo, move_unfinished_todos, toggle_todo, update_design, toggle_widget, create_custom_widget, add_dday, add_expense, add_habit, add_note',
          },
          payload: {
            type: Type.OBJECT,
            propertyOrdering: [
              'id',
              'targetTitle',
              'sourceTitle',
              'title',
              'date',
              'targetDate',
              'startTime',
              'endTime',
              'memo',
              'category',
              'importance',
              'repeat',
              'weekdays',
              'subtasks',
              'theme',
              'accent',
              'font',
              'defaultView',
              'layout',
              'widgetId',
              'visible',
              'widgetTitle',
              'widgetDescription',
              'widgetKind',
              'items',
              'amount',
              'targetPerWeek',
              'content',
            ],
            properties: {
              id: { type: Type.STRING },
              targetTitle: {
                type: Type.STRING,
                description: 'Existing schedule title when updating or deleting by title',
              },
              sourceTitle: {
                type: Type.STRING,
                description: 'Existing todo title to split into subtasks',
              },
              title: {
                type: Type.STRING,
                description: 'Schedule, todo, dday, habit, expense, or note title (required for add_schedule)',
              },
              date: {
                type: Type.STRING,
                description: 'YYYY-MM-DD in KST (REQUIRED for add_schedule, computed from context.todayKst)',
              },
              targetDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
              startTime: {
                type: Type.STRING,
                description:
                  '24-hour HH:mm start time (e.g. 15:00). MUST be empty string "" when the user did not mention any time.',
              },
              endTime: {
                type: Type.STRING,
                description:
                  '24-hour HH:mm end time (e.g. 16:00). MUST be empty string "" when the user did not mention any time. If only startTime is given, set +1 hour.',
              },
              memo: { type: Type.STRING, description: 'Optional note/memo text for the schedule' },
              category: { type: Type.STRING, description: 'Category such as 업무, 운동, 학습, 약속, 생활, 기타' },
              importance: { type: Type.STRING, description: 'high | medium | low' },
              repeat: { type: Type.STRING, description: 'none | daily | weekly | monthly' },
              weekdays: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: '0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat',
              },
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    importance: { type: Type.STRING, description: 'high | medium | low' },
                    category: { type: Type.STRING },
                  },
                },
                description: 'Subtasks for split_todo',
              },
              theme: {
                type: Type.STRING,
                description: 'cream | white | sage | lavender | pastel | monotone | dark',
              },
              accent: {
                type: Type.STRING,
                description: 'sage | lavender | charcoal | ocean | coral | forest',
              },
              font: {
                type: Type.STRING,
                description: 'sans | rounded | serif | mono',
              },
              defaultView: {
                type: Type.STRING,
                description: 'month | week | day',
              },
              layout: {
                type: Type.STRING,
                description: 'simple | diary | timetable',
              },
              widgetId: {
                type: Type.STRING,
                description:
                  'ONLY for toggle_widget: todos | dday | habits | focus | expenses | notes | routines | checklists | ai_recommend. Do NOT set on add_schedule.',
              },
              visible: { type: Type.BOOLEAN },
              widgetTitle: {
                type: Type.STRING,
                description: 'ONLY for create_custom_widget. Do NOT set on add_schedule.',
              },
              widgetDescription: { type: Type.STRING },
              widgetKind: {
                type: Type.STRING,
                description: 'checklist | counter | note_list | exam_study',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    date: { type: Type.STRING },
                    target: { type: Type.INTEGER },
                  },
                },
              },
              amount: { type: Type.NUMBER },
              targetPerWeek: { type: Type.INTEGER },
              content: { type: Type.STRING },
            },
          },
        },
        required: ['op', 'payload'],
      },
    },
  },
  required: [
    'intent',
    'intentLabel',
    'requiresConfirmation',
    'explanation',
    'previewSummary',
    'operations',
  ],
};

function isValidYmd(ymd: unknown): ymd is string {
  if (typeof ymd !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isValidHhmm(hhmm: unknown): hhmm is string {
  return typeof hhmm === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm.trim());
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.trim().split(':').map(Number);
  return h * 60 + m;
}

function validateAndNormalizeProposal(
  raw: unknown
): { ok: true; proposal: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'AI 응답 구조가 올바르지 않습니다.' };
  }
  const obj = raw as Record<string, unknown>;
  const intent = typeof obj.intent === 'string' ? obj.intent.trim() : '';
  if (!VALID_INTENTS.includes(intent as (typeof VALID_INTENTS)[number])) {
    return { ok: false, error: 'AI 응답의 요청 분류(intent)가 올바르지 않습니다.' };
  }

  const rawOps = Array.isArray(obj.operations) ? obj.operations : [];
  const explanation =
    typeof obj.explanation === 'string' && obj.explanation.trim()
      ? obj.explanation.trim()
      : '요청을 확인했습니다.';

  if (intent === 'unsupported') {
    return {
      ok: true,
      proposal: {
        intent,
        intentLabel:
          typeof obj.intentLabel === 'string' && obj.intentLabel.trim()
            ? obj.intentLabel.trim()
            : '지원하지 않는 요청',
        requiresConfirmation: false,
        explanation,
        previewSummary: Array.isArray(obj.previewSummary)
          ? obj.previewSummary.filter((s): s is string => typeof s === 'string')
          : [],
        operations: [],
      },
    };
  }

  const actionIntents = new Set([
    'schedule_action',
    'todo_action',
    'design_change',
    'widget_config',
    'widget_create',
  ]);

  if (actionIntents.has(intent) && rawOps.length === 0) {
    return {
      ok: false,
      error:
        '요청에서 실행 가능한 작업(제목·날짜 등)을 확인하지 못해 등록되지 않았습니다. 날짜와 내용을 구체적으로 입력해 주세요.',
    };
  }

  const normalizedOps: Array<{ op: string; payload: Record<string, unknown> }> = [];

  for (const item of rawOps) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'AI 작업 항목 형식이 올바르지 않습니다.' };
    }
    const opObj = item as Record<string, unknown>;
    const op = typeof opObj.op === 'string' ? opObj.op.trim() : '';
    if (!VALID_OPS.includes(op as (typeof VALID_OPS)[number])) {
      return { ok: false, error: `지원하지 않는 작업 유형(${op || 'unknown'})이 반환되었습니다.` };
    }
    const payload =
      opObj.payload && typeof opObj.payload === 'object' && !Array.isArray(opObj.payload)
        ? { ...(opObj.payload as Record<string, unknown>) }
        : {};

    if (op === 'add_schedule') {
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) {
        return { ok: false, error: '일정 제목을 확인할 수 없어 일정을 등록하지 않았습니다.' };
      }
      if (!isValidYmd(payload.date)) {
        return {
          ok: false,
          error: `유효하지 않은 일정 날짜(${String(payload.date ?? '미지정')})여서 일정을 등록하지 않았습니다.`,
        };
      }

      const startRaw = typeof payload.startTime === 'string' ? payload.startTime.trim() : '';
      const endRaw = typeof payload.endTime === 'string' ? payload.endTime.trim() : '';

      if (!startRaw && !endRaw) {
        payload.startTime = '';
        payload.endTime = '';
      } else if (!startRaw && endRaw) {
        return {
          ok: false,
          error: '종료 시간만 있고 시작 시간이 없어 일정을 등록하지 않았습니다.',
        };
      } else {
        if (!isValidHhmm(startRaw)) {
          return {
            ok: false,
            error: `올바르지 않은 시작 시간("${startRaw}")이어서 일정을 등록하지 않았습니다.`,
          };
        }
        payload.startTime = startRaw;
        if (!endRaw) {
          const sMin = hhmmToMinutes(startRaw);
          if (sMin >= 23 * 60 + 59) {
            return {
              ok: false,
              error: '23:59 시작 일정은 종료 시간을 지정해 주세요.',
            };
          }
          const eMin = Math.min(23 * 60 + 59, sMin + 60);
          payload.endTime = `${String(Math.floor(eMin / 60)).padStart(2, '0')}:${String(
            eMin % 60
          ).padStart(2, '0')}`;
        } else {
          if (!isValidHhmm(endRaw)) {
            return {
              ok: false,
              error: `올바르지 않은 종료 시간("${endRaw}")이어서 일정을 등록하지 않았습니다.`,
            };
          }
          if (hhmmToMinutes(endRaw) <= hhmmToMinutes(startRaw)) {
            return {
              ok: false,
              error: '종료 시간이 시작 시간보다 빠르거나 같아 일정을 등록하지 않았습니다.',
            };
          }
          payload.endTime = endRaw;
        }
      }

      delete payload.widgetId;
      delete payload.widgetTitle;
      payload.title = title;
      payload.date = payload.date.trim();
    } else if (op === 'update_schedule') {
      if (payload.date !== undefined && String(payload.date).trim() !== '' && !isValidYmd(payload.date)) {
        return {
          ok: false,
          error: `유효하지 않은 수정 날짜("${String(payload.date)}")여서 일정을 수정하지 않았습니다.`,
        };
      }
      const startRaw = typeof payload.startTime === 'string' ? payload.startTime.trim() : '';
      const endRaw = typeof payload.endTime === 'string' ? payload.endTime.trim() : '';
      if (startRaw && !isValidHhmm(startRaw)) {
        return {
          ok: false,
          error: `올바르지 않은 시작 시간("${startRaw}")이어서 일정을 수정하지 않았습니다.`,
        };
      }
      if (endRaw && !isValidHhmm(endRaw)) {
        return {
          ok: false,
          error: `올바르지 않은 종료 시간("${endRaw}")이어서 일정을 수정하지 않았습니다.`,
        };
      }
      if (startRaw && endRaw && hhmmToMinutes(endRaw) <= hhmmToMinutes(startRaw)) {
        return {
          ok: false,
          error: '종료 시간은 시작 시간보다 늦어야 합니다.',
        };
      }
    }

    normalizedOps.push({ op, payload });
  }

  return {
    ok: true,
    proposal: {
      intent,
      intentLabel:
        typeof obj.intentLabel === 'string' && obj.intentLabel.trim()
          ? obj.intentLabel.trim()
          : '요청 처리',
      requiresConfirmation: Boolean(obj.requiresConfirmation),
      explanation,
      previewSummary: Array.isArray(obj.previewSummary)
        ? obj.previewSummary.filter((s): s is string => typeof s === 'string')
        : [],
      operations: normalizedOps,
    },
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/ai/plan', async (req, res) => {
  try {
    const body = req.body as {
      prompt?: unknown;
      context?: unknown;
    };

    if (!body || typeof body.prompt !== 'string') {
      res.status(400).json({ error: '요청 문장을 올바르게 입력해 주세요.' });
      return;
    }

    const userPrompt = body.prompt.trim();
    if (!userPrompt || userPrompt.length > 1000) {
      res.status(400).json({ error: '요청은 1자 이상 1,000자 이하로 입력해 주세요.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'AI API 키가 설정되어 있지 않아 자연어 AI 분석을 사용할 수 없습니다. 기본 달력·할 일·위젯 기능은 계속 정상 동작합니다.',
      });
      return;
    }

    const contextSummary =
      typeof body.context === 'object' && body.context !== null
        ? JSON.stringify(body.context).slice(0, 12000)
        : '{}';

    const systemInstruction = `
당신은 한국어 개인 맞춤형 라이프 플래너 서비스 "MY DAY" (슬로건: 당신의 하루를 당신답게)의 AI 플래너 엔진입니다.
사용자의 자연어 요청을 정확히 분석하여 아래 7가지 intent 중 하나로 분류하고 실행 가능한 JSON 응답을 반환하세요.

[intent 분류]
1. schedule_action: 일정 추가(add_schedule), 수정(update_schedule), 삭제(delete_schedule), 반복 일정 등록
2. todo_action: 할 일 추가(add_todo), 완료 처리(toggle_todo), 할 일 삭제(delete_todo), 할 일 분리(split_todo), 미완료 이동(move_unfinished_todos)
3. design_change: 테마/배경색/강조색/글꼴/달력 보기/레이아웃 변경(update_design)
4. widget_config: 기존 기본 위젯(todos, dday, habits, focus, expenses, notes, routines, checklists, ai_recommend) 표시·숨김(toggle_widget)
5. widget_create: 새 커스텀 위젯 생성(create_custom_widget)
6. schedule_analysis: 시험공부 계획 짜기, 일정 충돌/여유 시간 분석 및 일정 제안
7. unsupported: 외부 결제, 실제 병원/식당 예약, 문자/전화 발송, 또는 존재하지 않는 날짜(예: 2월 30일)·잘못된 시간(예: 25시) 등 실행 불가능한 요청. 이 경우 operations는 반드시 []로 두고 정직하게 사유를 안내하세요.

[일정 등록(add_schedule) 및 수정(update_schedule) payload 필수 규칙 — 매우 중요]
- add_schedule의 payload에는 반드시 title, date(YYYY-MM-DD), startTime, endTime, memo, category, importance, repeat를 채우세요.
- add_schedule에 절대 widgetId나 widgetTitle을 넣지 마세요.
- 날짜는 context.todayKst(YYYY-MM-DD)를 기준으로 한국 시간(KST)으로 정확히 계산하세요.
  예: todayKst가 "2026-11-23"일 때 "오늘" = "2026-11-23", "내일" = "2026-11-24", "모레" = "2026-11-25".
- 시간 처리 규칙:
  1) 사용자가 시작과 종료 시간을 말한 경우(예: "오후 3시부터 4시까지") -> 24시간제 "15:00", "16:00"으로 startTime, endTime을 설정하세요.
  2) 사용자가 시작 시간만 말한 경우(예: "오후 2시 치과") -> startTime: "14:00", endTime: "15:00".
  3) 사용자가 시간을 전혀 말하지 않은 경우(예: "내일 독서 일정을 추가해 줘") -> 절대로 임의의 시간을 지어내지 말고 반드시 startTime: "", endTime: "" (빈 문자열)로 두세요!
- update_schedule 또는 delete_schedule 시에는 context.schedules의 id 또는 targetTitle을 정확히 지정하세요.
- explanation은 앱이 실제로 검증·저장한 뒤에 최종 확정하므로 "등록했습니다/추가했습니다" 대신 "2026-11-24 15:00~16:00 '운동' 일정을 등록합니다"처럼 실행 예정 문장으로 작성하세요.

[응답 예시]
예시 1) todayKst="2026-11-23", 요청="내일 오후 3시부터 4시까지 운동 일정을 추가해 줘."
{
  "intent": "schedule_action",
  "intentLabel": "일정 추가",
  "requiresConfirmation": false,
  "explanation": "내일(2026-11-24) 15:00~16:00 '운동' 일정을 등록합니다.",
  "previewSummary": ["2026-11-24 15:00~16:00 운동"],
  "operations": [
    {
      "op": "add_schedule",
      "payload": {
        "title": "운동",
        "date": "2026-11-24",
        "startTime": "15:00",
        "endTime": "16:00",
        "memo": "",
        "category": "운동",
        "importance": "medium",
        "repeat": "none"
      }
    }
  ]
}

예시 2) todayKst="2026-11-23", 요청="내일 독서 일정을 추가해 줘." (시간 언급 없음)
{
  "intent": "schedule_action",
  "intentLabel": "일정 추가",
  "requiresConfirmation": false,
  "explanation": "내일(2026-11-24) 시간 미정으로 '독서' 일정을 등록합니다.",
  "previewSummary": ["2026-11-24 (시간 미정) 독서"],
  "operations": [
    {
      "op": "add_schedule",
      "payload": {
        "title": "독서",
        "date": "2026-11-24",
        "startTime": "",
        "endTime": "",
        "memo": "",
        "category": "학습",
        "importance": "medium",
        "repeat": "none"
      }
    }
  ]
}

[일반 원칙]
- 일정 삭제(delete_schedule), 할 일 삭제(delete_todo), 2건 이상의 일정 변경/추가, 할 일 분리(split_todo), 미완료 일괄 이동(move_unfinished_todos), 여러 날 공부 계획 생성, 새 위젯 생성은 requiresConfirmation: true로 설정하세요.
- 기존 기본 위젯으로 해결 가능한 요청(예: D-day, 지출 기록)은 toggle_widget을 우선 사용하세요.
- 잘못된 날짜(예: 2026-02-30)나 24시 초과 시간 등 등록 불가능한 입력은 임의로 날짜·시간을 바꾸지 말고 intent: "unsupported", operations: []로 거절 안내하세요.
- 모든 응답 문장은 친절하고 간결한 한국어로 작성하세요.
`.trim();

    let response;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `현재 플래너 상태 요약:\n${contextSummary}\n\n사용자 요청:\n"${userPrompt}"`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: aiResponseSchema,
          },
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isAuthOrQuota =
          msg.includes('API_KEY_INVALID') ||
          msg.includes('PERMISSION_DENIED') ||
          msg.includes('API_KEY');
        if (isAuthOrQuota || attempt === 2) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }

    if (!response) {
      throw lastErr instanceof Error ? lastErr : new Error('Empty Gemini response');
    }

    const rawText = response.text;
    if (!rawText) {
      res.status(502).json({ error: 'AI 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      res.status(502).json({ error: 'AI 응답 JSON 형식을 해석할 수 없습니다. 다시 시도해 주세요.' });
      return;
    }

    const validated = validateAndNormalizeProposal(parsed);
    if (!validated.ok) {
      res.status(422).json({ error: validated.error });
      return;
    }

    res.json({ proposal: validated.proposal });
  } catch (err) {
    console.error('AI plan error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const statusCode =
      typeof (err as { status?: unknown })?.status === 'number'
        ? ((err as { status: number }).status)
        : undefined;

    if (errMsg.includes('API_KEY') || errMsg.includes('PERMISSION_DENIED') || statusCode === 403) {
      res.status(401).json({
        error: 'API 키 설정을 확인해 주세요. 기본 플래너 기능은 그대로 이용하실 수 있습니다.',
      });
      return;
    }
    if (errMsg.includes('RESOURCE_EXHAUSTED') || statusCode === 429) {
      res.status(429).json({
        error: 'AI 요청 한도를 잠시 초과했습니다. 약 1분 후 다시 시도해 주세요. 기본 달력·일정 기능은 계속 사용하실 수 있습니다.',
      });
      return;
    }
    res.status(500).json({
      error: 'AI 요청을 처리하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MY DAY server listening on http://localhost:${PORT}`);
  });
}

startServer();
