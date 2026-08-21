const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function rankMatches(request, responders) {
  return responders
    .filter((responder) => responder.available && (responder.capacity ?? 1) > 0)
    .map((responder) => {
      const skills = (responder.skills ?? []).map(normalize);
      const areas = (responder.areas ?? []).map(normalize);
      let score = 0;
      if (skills.includes(normalize(request.category))) score += 50;
      if (areas.includes(normalize(request.publicArea))) score += 30;
      if (responder.verified) score += 10;
      if ((responder.capacity ?? 0) >= request.peopleCount) score += 10;
      return { ...responder, matchScore: score };
    })
    .filter((responder) => responder.matchScore >= 50)
    .sort((a, b) => b.matchScore - a.matchScore || normalize(a.name).localeCompare(normalize(b.name)));
}
