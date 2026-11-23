// 1. Compression et redimensionnement côté client (max 1200px, qualité 75%)
export async function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas non supporté'));

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Échec de la compression'));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// 2. Génération automatique de tags pertinents depuis le texte et la ville
const STOP_WORDS = new Set([
  'pour', 'avec', 'dans', 'plus', 'tout', 'tous', 'cette', 'sont', 'mais',
  'nous', 'vous', 'leur', 'bien', 'faire', 'comme', 'avoir', 'être', 'http', 'https', 'www', 'com'
]);

export function generateAutoTags(title: string, content: string, location: string): string[] {
  const tags = new Set<string>();

  // Ajouter la ville comme tag automatique si présente (ex: "Rue Principale, Gatineau" -> "gatineau")
  if (location) {
    const parts = location.split(',');
    const city = parts[parts.length - 1].trim().toLowerCase().replace(/[^a-zà-ÿ0-9-]/g, '');
    if (city.length >= 3) tags.add(city);
  }

  // Extraire les mots significatifs (> 4 lettres) du titre et du contenu
  const combined = `${title} ${content}`.toLowerCase();
  const words = combined.match(/[a-zà-ÿ0-9]{5,}/g) || [];

  for (const word of words) {
    if (!STOP_WORDS.has(word) && tags.size < 4) {
      tags.add(word);
    }
  }

  return Array.from(tags);
}
