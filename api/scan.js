export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { lat, lng, radius } = req.query;
  if (!lat || !lng) { res.status(400).json({ error: 'lat/lng required' }); return; }

  const KEY = process.env.GOOGLE_API_KEY;
  const r = parseInt(radius) || 2000;

  try {
    const allPlaces = [];
    const seen = new Set();

    const searches = [
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&type=apartment&key=${KEY}`,
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=immeuble+appartements&key=${KEY}`,
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=logements+locatifs&key=${KEY}`,
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=multiplex+plex&key=${KEY}`,
    ];

    for (const url of searches) {
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.results) {
          for (const p of data.results) {
            if (!seen.has(p.place_id)) {
              seen.add(p.place_id);
              allPlaces.push({
                id: p.place_id,
                name: p.name,
                address: p.vicinity,
                lat: p.geometry.location.lat,
                lng: p.geometry.location.lng,
                types: p.types,
                rating: p.rating,
                userRatings: p.user_ratings_total || 0,
              });
            }
          }
        }
      } catch(e) { continue; }
    }

    res.status(200).json({ places: allPlaces, total: allPlaces.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
