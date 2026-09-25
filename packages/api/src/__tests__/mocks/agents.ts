export class Agent<Env = unknown> {
  ctx: unknown;
  env: Env;
  state: unknown;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async getState(): Promise<unknown> {
    return this.state;
  }

  async setState(state: unknown): Promise<void> {
    this.state = state;
  }

  async onRequest(request: Request): Promise<Response> {
    return new Response('OK');
  }
}
