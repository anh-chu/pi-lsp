import { registerPiLspCommands } from './commands.ts';
import { registerPiLspTools } from './tools.ts';

export default function register(pi: any) {
  registerPiLspTools(pi);
  registerPiLspCommands(pi);
}
