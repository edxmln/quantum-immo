export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { lat, lng, radius } = req.query;
  if (!lat || !lng) { res.status(400).json({ error: 'lat/lng required' }); return; }

  const KEY = process.env.GOOGLE_API_KEY;
  const r = parseInt(radius) || 2000;

  // Keywords spécifiquement résidentiels québécois
  const searches = [
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&type=apartment&key=${KEY}`,
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=appartements+loyer&type=lodging&key=${KEY}`,
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=immeuble+logements&key=${KEY}`,
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=plex+résidentiel&key=${KEY}`,
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=condos+locatifs&key=${KEY}`,
  ];

  // Mots qui indiquent que c'est PAS résidentiel
  const BLACKLIST = [
    'restaurant','café','cafe','bar','épicerie','grocery','bank','banque',
    'cinema','cinéma','hotel','hôtel','gym','sport','école','school',
    'church','église','hospital','clinique','pharmacy','pharmacie',
    'garage','service','store','magasin','mall','centre commercial',
    'cibc','rbc','td bank','desjardins','maxi','iga','metro','provigo',
    'mcdonalds','tim hortons','subway','pizza','sushi','bureau','office',
    'correctional','service canada','government','gouvernement'
  ];

  // Mots qui confirment que c'est résidentiel
  const WHITELIST = [
    'appartement','apartment','logement','locatif','résidence','residence',
    'plex','multiplex','duplex','triplex','immeuble','condo','housing',
    'loyer','rental','habitation','loft','studio'
  ];

  try {
    const allPlaces = new Map();

    for (const url of searches) {
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.results) continue;

        for (const p of data.results) {
          if (allPlaces.has(p.place_id)) continue;

          const name = (p.name || '').toLowerCase();
          const types = p.types || [];

          // Skip si blacklisté
          if (BLACKLIST.some(b => name.includes(b))) continue;

          // Skip les types clairement non-résidentiels
          const badTypes = ['food','restaurant','bar','bank','store','school',
            'hospital','place_of_worship','gas_station','grocery_or_supermarket'];
          if (badTypes.some(t => types.includes(t))) continue;

          // Score résidentiel
          let residentialScore = 0;
          if (WHITELIST.some(w => name.includes(w))) residentialScore += 50;
          if (types.includes('apartment')) residentialScore += 40;
          if (types.includes('lodging')) residentialScore += 20;
          if (!p.rating && !p.user_ratings_total) residentialScore += 15;
          if (/^\d+/.test(p.name)) residentialScore += 20; // starts with number = address

          // Garder seulement si score résidentiel > 0 ou type apartment
          if (residentialScore === 0 && !types.includes('apartment')) continue;

          allPlaces.set(p.place_id, {
            id: p.place_id,
            name: p.name,
            address: p.vicinity,
            lat: p.geometry.location.lat,
            lng: p.geometry.location.lng,
            types: p.types,
            rating: p.rating,
            userRatings: p.user_ratings_total || 0,
            residentialScore,
          });
        }
      } catch(e) { continue; }
    }

    const places = Array.from(allPlaces.values())
      .sort((a, b) => b.residentialScore - a.residentialScore);

    res.status(200).json({ places, total: places.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
