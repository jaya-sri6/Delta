import { TemporalResolution } from '../types/index.js';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private fixedDate: Date) {}
  now(): Date {
    return new Date(this.fixedDate.getTime());
  }
}

export class TemporalResolver {
  constructor(
    private clock: Clock = new SystemClock(),
    private defaultTimezone: string = 'Asia/Kolkata'
  ) {}

  /**
   * Resolves a temporal expression into start and end ISO-8601 timestamps.
   */
  resolve(expression: string, referenceDate?: Date): TemporalResolution {
    const ref = referenceDate || this.clock.now();
    const cleanExpr = expression.trim().toLowerCase();
    const refIso = ref.toISOString();

    // 1. "today" / "as of today"
    if (/\b(today|as of today)\b/i.test(cleanExpr)) {
      const start = this.startOfDay(ref);
      const end = this.endOfDay(ref);
      return {
        original_expression: expression,
        resolved_start: start.toISOString(),
        resolved_end: end.toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'DAY_RELATIVE',
        confidence: 0.98,
      };
    }

    // 2. "yesterday"
    if (/\byesterday\b/i.test(cleanExpr)) {
      const yesterday = new Date(ref);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        original_expression: expression,
        resolved_start: this.startOfDay(yesterday).toISOString(),
        resolved_end: this.endOfDay(yesterday).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'DAY_RELATIVE',
        confidence: 0.98,
      };
    }

    // 3. "tomorrow"
    if (/\btomorrow\b/i.test(cleanExpr)) {
      const tomorrow = new Date(ref);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        original_expression: expression,
        resolved_start: this.startOfDay(tomorrow).toISOString(),
        resolved_end: this.endOfDay(tomorrow).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'DAY_RELATIVE',
        confidence: 0.98,
      };
    }

    // 4. "last monday", "last tuesday", "last wednesday", etc. or "on monday", "on tuesday"
    const weekdayMatch = cleanExpr.match(/\b(last|on|this past)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i) ||
                         cleanExpr.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);

    if (weekdayMatch) {
      const targetDayName = (weekdayMatch[2] || weekdayMatch[1]).toLowerCase();
      const prefix = weekdayMatch[2] ? weekdayMatch[1].toLowerCase() : '';
      const dayIndexMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };

      const targetDay = dayIndexMap[targetDayName];
      const currentDay = ref.getDay();
      
      let diffDays = (currentDay - targetDay + 7) % 7;
      if (prefix === 'last') {
        diffDays = diffDays === 0 ? 7 : diffDays;
        // If today is Monday and user asks "last Monday", it's 7 days ago
        if (diffDays < 7) {
          diffDays += 7;
        }
      } else {
        // "on Monday" or "this past Monday": if diff is 0 and it's morning/asking about past, could be today or 7 days ago
        if (diffDays === 0) diffDays = 7;
      }

      const resolvedDate = new Date(ref);
      resolvedDate.setDate(resolvedDate.getDate() - diffDays);

      return {
        original_expression: expression,
        resolved_start: this.startOfDay(resolvedDate).toISOString(),
        resolved_end: this.endOfDay(resolvedDate).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'WEEKDAY_RELATIVE',
        confidence: 0.95,
      };
    }

    // 5. "last week"
    if (/\blast week\b/i.test(cleanExpr)) {
      const end = new Date(ref);
      end.setDate(end.getDate() - 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      return {
        original_expression: expression,
        resolved_start: this.startOfDay(start).toISOString(),
        resolved_end: this.endOfDay(end).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'WEEK_RELATIVE',
        confidence: 0.92,
      };
    }

    // 6. "this week"
    if (/\bthis week\b/i.test(cleanExpr)) {
      const currentDay = ref.getDay();
      const diffToMonday = (currentDay + 6) % 7;
      const monday = new Date(ref);
      monday.setDate(monday.getDate() - diffToMonday);
      return {
        original_expression: expression,
        resolved_start: this.startOfDay(monday).toISOString(),
        resolved_end: this.endOfDay(ref).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'WEEK_RELATIVE',
        confidence: 0.92,
      };
    }

    // 7. "last month"
    if (/\blast month\b/i.test(cleanExpr)) {
      const prevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const endPrevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
      return {
        original_expression: expression,
        resolved_start: prevMonth.toISOString(),
        resolved_end: endPrevMonth.toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'MONTH_RELATIVE',
        confidence: 0.95,
      };
    }

    // 8. "earlier this month"
    if (/\bearlier this month\b/i.test(cleanExpr)) {
      const startOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
      return {
        original_expression: expression,
        resolved_start: startOfMonth.toISOString(),
        resolved_end: this.endOfDay(ref).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'MONTH_RELATIVE',
        confidence: 0.90,
      };
    }

    // 9. Specific calendar dates like "3 November", "November 3", "Nov 3", "November 3rd"
    const dateMatch = cleanExpr.match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?)|(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?)\b/i);

    if (dateMatch) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      let day: number;
      let monthStr: string;
      let year: number;

      if (dateMatch[1] && dateMatch[2]) {
        day = parseInt(dateMatch[1], 10);
        monthStr = dateMatch[2].substring(0, 3).toLowerCase();
        year = dateMatch[3] ? parseInt(dateMatch[3], 10) : ref.getFullYear();
      } else {
        monthStr = dateMatch[4].substring(0, 3).toLowerCase();
        day = parseInt(dateMatch[5], 10);
        year = dateMatch[6] ? parseInt(dateMatch[6], 10) : ref.getFullYear();
      }

      const monthIndex = monthNames.indexOf(monthStr);
      // If no year specified and date is in the future compared to reference, it probably means the previous year
      const parsedDate = new Date(year, monthIndex, day);
      if (!dateMatch[3] && !dateMatch[6] && parsedDate.getTime() > ref.getTime()) {
        parsedDate.setFullYear(year - 1);
      }

      return {
        original_expression: expression,
        resolved_start: this.startOfDay(parsedDate).toISOString(),
        resolved_end: this.endOfDay(parsedDate).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'EXPLICIT_DATE',
        confidence: 0.99,
      };
    }

    // 10. "since our last conversation" / "since we discussed this" / "since then" / "since our last discussion" / "since the previous answer"
    if (/\b(since (?:our |the )?(?:last )?(?:conversation|discussion|previous answer|answer|shortlist|decision)|since we discussed|since then)\b/i.test(cleanExpr)) {
      return {
        original_expression: expression,
        resolved_start: null, // to be filled dynamically from historical conversation/event timestamp
        resolved_end: this.endOfDay(ref).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'CONVERSATION_RELATIVE',
        confidence: 0.95,
      };
    }

    // 11. "recently" / "latest"
    if (/\b(recently|latest)\b/i.test(cleanExpr)) {
      const thirtyDaysAgo = new Date(ref);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        original_expression: expression,
        resolved_start: this.startOfDay(thirtyDaysAgo).toISOString(),
        resolved_end: this.endOfDay(ref).toISOString(),
        timezone: this.defaultTimezone,
        reference_timestamp: refIso,
        resolution_method: 'RECENT_WINDOW',
        confidence: 0.85,
      };
    }

    // Fallback: unresolved
    return {
      original_expression: expression,
      resolved_start: null,
      resolved_end: null,
      timezone: this.defaultTimezone,
      reference_timestamp: refIso,
      resolution_method: 'UNRESOLVED',
      confidence: 0.3,
    };
  }

  /**
   * Helper to extract any temporal expressions found in a user prompt.
   */
  extractTemporalExpressions(text: string): string[] {
    const patterns = [
      /\b(today|as of today)\b/i,
      /\byesterday\b/i,
      /\btomorrow\b/i,
      /\b(last|on|this past)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      /\b(last week|this week|last month|earlier this month)\b/i,
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)\b/i,
      /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?)\b/i,
      /\b(since (?:our |the )?(?:last )?(?:conversation|discussion|previous answer|answer|shortlist|decision)|since we discussed|since then)\b/i,
      /\b(recently|latest)\b/i,
    ];

    const found: string[] = [];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        found.push(match[0]);
      }
    }
    return found;
  }

  private startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private endOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }
}

