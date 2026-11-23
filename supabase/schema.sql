-- 1. Extension UUID (probablement déjà activée sur le projet)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table principale WattElse
CREATE TABLE IF NOT EXISTS we_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('note', 'link', 'image')) NOT NULL DEFAULT 'note',
    title TEXT,
    content TEXT,
    url TEXT,
    image_url TEXT,
    location_name TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    event_date TIMESTAMPTZ DEFAULT NOW(),
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des tags WattElse
CREATE TABLE IF NOT EXISTS we_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);

-- 4. Table de liaison WattElse
CREATE TABLE IF NOT EXISTS we_item_tags (
    item_id UUID REFERENCES we_items(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES we_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);

-- 5. Activation RLS
ALTER TABLE we_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE we_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE we_item_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WE: Utilisateurs gèrent leurs items" 
ON we_items FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "WE: Utilisateurs gèrent leurs tags" 
ON we_tags FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "WE: Utilisateurs gèrent leurs liaisons" 
ON we_item_tags FOR ALL USING (
    EXISTS (SELECT 1 FROM we_items WHERE we_items.id = we_item_tags.item_id AND we_items.user_id = auth.uid())
);

-- 6. Bucket de stockage dédié à WattElse
INSERT INTO storage.buckets (id, name, public) 
VALUES ('wattelse-media', 'wattelse-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "WE: Upload authentifié" 
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'wattelse-media');

CREATE POLICY "WE: Lecture publique" 
ON storage.objects FOR SELECT TO public USING (bucket_id = 'wattelse-media');
