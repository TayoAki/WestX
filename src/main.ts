import { Game } from "./game";

const app = document.getElementById("app") as HTMLElement;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(app, canvas);
game.run();

// Exposed for automated smoke tests and for poking at the match from the console.
(window as unknown as { __westx: Game }).__westx = game;
