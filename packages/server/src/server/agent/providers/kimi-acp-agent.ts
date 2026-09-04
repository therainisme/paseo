import type { Logger } from "pino";

import { resolvePerModelThinkingOptions } from "./acp-agent.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

interface KimiACPAgentClientOptions {
  logger: Logger;
  command: [string, ...string[]];
  env?: Record<string, string>;
  providerId?: string;
  label?: string;
  providerParams?: unknown;
}

/**
 * Kimi reports different thinking-effort levels per model (a boolean on/off toggle for one
 * model, a multi-level select for another), so it always needs the per-model catalog probe
 * from {@link resolvePerModelThinkingOptions}. Other ACP providers opt in through their
 * provider params, which keeps the extra `setSessionConfigOption` round trips away from
 * agents that expose per-model metadata up front.
 */
export class KimiACPAgentClient extends GenericACPAgentClient {
  constructor(options: KimiACPAgentClientOptions) {
    super({
      logger: options.logger,
      command: options.command,
      env: options.env,
      providerId: options.providerId,
      label: options.label,
      providerParams: options.providerParams,
      catalogModelResolver: resolvePerModelThinkingOptions,
    });
  }
}
