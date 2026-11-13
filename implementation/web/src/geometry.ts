// Where things sit on the poker table, read from the table-layout component's portrait layout.
// The component gives fractions of the table box; the screens position in percent.
import { relativeSeat, tableLayout, type Point, type TableLayout } from "../../components/table-layout/web/index";
export type { Point };
import type { PlayerView, View } from "./api";

const layouts = new Map<number, TableLayout>();

export function layoutFor(seats: number): TableLayout {
  const n = Math.min(9, Math.max(2, seats));
  let layout = layouts.get(n);
  if (!layout) layouts.set(n, (layout = tableLayout({ seats: n, orientation: "portrait" })));
  return layout;
}

export const percent = (p: Point): Point => ({ x: p.x * 100, y: p.y * 100 });

export const seatCount = (view: View): number => Math.max(2, view.players.length);
export const mySeatOf = (view: View): number => view.players.find((p) => p.id === view.you)?.seat ?? 0;
export const seatIndex = (p: PlayerView, view: View): number => relativeSeat(p.seat, mySeatOf(view), seatCount(view));

export const seatSpot = (k: number, n: number): Point => percent(layoutFor(n).seatSpots[k] ?? { x: 0.5, y: 0.7 });
export const cardsSpot = (k: number, n: number): Point => percent(layoutFor(n).seatSpots[k]?.cards ?? { x: 0.5, y: 0.7 });
export const shownSpot = (k: number, n: number): Point => percent(layoutFor(n).seatSpots[k]?.shown ?? { x: 0.5, y: 0.7 });
export const betSpot = (k: number, n: number): Point => percent(layoutFor(n).seatSpots[k]?.bet ?? { x: 0.5, y: 0.7 });
export const potSpot = (n: number): Point => percent(layoutFor(n).pot);
export const deckSpot = (n: number): Point => percent(layoutFor(n).deck);
export const burnSpot = (n: number): Point => percent(layoutFor(n).burn);
export const boardSpot = (n: number, i: number): Point => percent(layoutFor(n).board[i] ?? { x: 0.5, y: 0.5 });

// Seats counted clockwise from the dealer button, for the order cards are dealt in.
export const distanceFrom = (seat: number, from: number, seats = 9): number => (((seat - from) % seats) + seats) % seats || seats;

// Where your own cards come up from, below the table.
export const YOUR_HAND: Point = { x: 50, y: 122 };
