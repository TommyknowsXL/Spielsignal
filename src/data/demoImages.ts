const categoryImages: Record<string, string> = {
  Rollenspiele: "/images/demo/fantasy.svg",
  Fantasy: "/images/demo/fantasy.svg",
  Survival: "/images/demo/survival.svg",
  Strategie: "/images/demo/strategy.svg",
  Shooter: "/images/demo/shooter.svg",
  Simulation: "/images/demo/strategy.svg",
  Indie: "/images/demo/indie.svg",
  Updates: "/images/demo/sci-fi.svg",
  News: "/images/demo/sci-fi.svg",
  Deals: "/images/demo/deals.svg"
};

export function demoImageFor(category: string): string {
  return categoryImages[category] ?? "/images/demo/sci-fi.svg";
}

export function demoImageAlt(category: string): string {
  return `Abstrakter ${category}-Platzhalter für einen Demo-Inhalt`;
}
