'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImage, generateAutoTags } from '@/lib/helpers';
import {
  MapPin,
  Calendar,
  Link as LinkIcon,
  Plus,
  Search,
  Pin,
  Loader2,
  Sparkles,
  Pencil,
  Trash2,
  X,
  ArrowUpDown,
  Map as MapIcon,
  List,
  LogOut,
  Check,
  Navigation,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

declare global {
  interface Window {
    L: any;
  }
}

interface WattItem {
  id: string;
  type: 'note' | 'link' | 'image';
  title: string;
  content: string;
  url?: string;
  image_url?: string;
  location_name?: string;
  latitude?: number | null;
  longitude?: number | null;
  event_date: string;
  is_pinned: boolean;
  tags: string[];
}

export default function WattElseHome() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const [items, setItems] = useState<WattItem[]>([]);
  const [isDesktop, setIsDesktop] = useState(false);

  // Navigation mobile ('list' | 'map') et réduction du formulaire
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [isAddCollapsed, setIsAddCollapsed] = useState(false);

  // Filtres et tri
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'note' | 'link' | 'image'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'location'>('newest');

  // États du formulaire d'ajout rapide
  const [type, setType] = useState<'note' | 'link' | 'image'>('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [geocodingLocation, setGeocodingLocation] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState('');

  // États de la modale (Visualisation / Édition)
  const [activeItem, setActiveItem] = useState<WattItem | null>(null);
  const [isModalEditing, setIsModalEditing] = useState(false);
  const [editType, setEditType] = useState<'note' | 'link' | 'image'>('note');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCoords, setEditCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalGeocoding, setModalGeocoding] = useState(false);

  // Références Carte Leaflet
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const previewMarkerRef = useRef<any>(null);

  // Détection taille écran (PC vs Mobile)
  useEffect(() => {
    const checkScreen = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // Authentification
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialisation date locale, GPS et données
  useEffect(() => {
    if (!user) return;
    resetDateToNow();
    detectLocationSilently();
    fetchItems();
  }, [user]);

  const resetDateToNow = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setEventDate(now.toISOString().slice(0, 16));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage('Envoi du lien de connexion...');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setAuthMessage(`Erreur : ${error.message}`);
    } else {
      setAuthMessage('Vérifie ta boîte courriel et clique sur le lien magique.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setItems([]);
  };

  // Géolocalisation GPS actuelle
  const showPreviewPinOnMap = (lat: number, lng: number, label: string) => {
  const map = mapInstanceRef.current;
  if (!map || !window.L) return;

  if (previewMarkerRef.current) {
    previewMarkerRef.current.remove();
  }

  const marker = window.L.circleMarker([lat, lng], {
    radius: 11,
    fillColor: '#f43f5e',
    color: '#ffffff',
    weight: 3,
    opacity: 1,
    fillOpacity: 1,
  }).addTo(map);

  marker.bindTooltip(`Aperçu : ${label || 'Nouveau point'}`, {
    permanent: true,
    direction: 'top',
    offset: [0, -10],
  });

  previewMarkerRef.current = marker;
  map.setView([lat, lng], 15, { animate: true });
};


  const detectLocationSilently = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setCoords({ lat: latitude, lng: longitude });
          showPreviewPinOnMap(lat, lng, locationName);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await res.json();
            const city = data.address.city || data.address.town || data.address.village || '';
            const road = data.address.road || '';
            setLocationName(`${road ? road + ', ' : ''}${city}`);
          } catch {
            setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  // Géocodage d'un lieu public saisi manuellement (ex: aréna, resto)
  const geocodePlaceName = async (query: string): Promise<{ lat: number; lng: number; displayName?: string } | null> => {
    if (!query.trim()) return null;
    try {
      const searchStr = query.toLowerCase().includes('gatineau') || query.toLowerCase().includes('québec') || query.toLowerCase().includes('canada')
        ? query
        : `${query}, Gatineau, QC`;

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchStr)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name.split(',').slice(0, 2).join(',').trim(),
        };
      }

      const fallbackRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.length > 0) {
        return {
          lat: parseFloat(fallbackData[0].lat),
          lng: parseFloat(fallbackData[0].lon),
          displayName: fallbackData[0].display_name.split(',').slice(0, 2).join(',').trim(),
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleManualGeocodeCreate = async () => {
    if (!locationName.trim()) return;
    setGeocodingLocation(true);
    const result = await geocodePlaceName(locationName);
    if (result) {
      setCoords({ lat: result.lat, lng: result.lng });
      if (result.displayName) setLocationName(result.displayName);
    } else {
      alert("Lieu introuvable sur la carte. Essaie d'ajouter la ville (ex: Centre Slush Puppie, Gatineau).");
    }
    setGeocodingLocation(false);
  };

  const handleManualGeocodeEdit = async () => {
    if (!editLocation.trim()) return;
    setModalGeocoding(true);
    const result = await geocodePlaceName(editLocation);
    if (result) {
      setEditCoords({ lat: result.lat, lng: result.lng });
      if (result.displayName) setEditLocation(result.displayName);
    } else {
      alert("Lieu introuvable sur la carte. Essaie d'ajouter la ville.");
    }
    setModalGeocoding(false);
  };

  // Remplissage automatique au collage d'une URL
  const handleUrlChange = async (newUrl: string) => {
    setUrl(newUrl);
    if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
      setFetchingUrl(true);
      try {
        const res = await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newUrl }),
        });
        const data = await res.json();
        if (data.title && !title) setTitle(data.title);
        if (data.description && !content) setContent(data.description);
        if (data.image) setPreviewImageUrl(data.image);
      } catch {
      } finally {
        setFetchingUrl(false);
      }
    }
  };

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile) {
      const originalKb = Math.round(selectedFile.size / 1024);
      setCompressionInfo(`Original : ${originalKb} Ko (sera compressé avant envoi)`);
    } else {
      setCompressionInfo('');
    }
  };

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('we_items')
      .select(`*, we_item_tags(we_tags(name))`)
      .order('is_pinned', { ascending: false })
      .order('event_date', { ascending: false });

    if (!error && data) {
      const formatted = data.map((item: any) => ({
        ...item,
        tags: item.we_item_tags?.map((it: any) => it.we_tags.name) || [],
      }));
      setItems(formatted);
    }
  };

  // Enregistrement d'une nouvelle fiche
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    let finalImageUrl = previewImageUrl || '';
    let finalCoords = coords;

    if (!finalCoords && locationName.trim()) {
      const found = await geocodePlaceName(locationName);
      if (found) finalCoords = { lat: found.lat, lng: found.lng };
    }

    if (type === 'image' && file) {
      try {
        const compressedBlob = await compressImage(file, 1200, 0.75);
        const fileName = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('wattelse-media')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('wattelse-media')
            .getPublicUrl(fileName);
          finalImageUrl = publicUrlData.publicUrl;
        }
      } catch (err) {
        console.error('Erreur compression/upload:', err);
      }
    }

    const { data: newItem } = await supabase
      .from('we_items')
      .insert({
        user_id: user.id,
        type,
        title: title || (type === 'link' ? url : 'Note rapide'),
        content,
        url: type === 'link' ? url : null,
        image_url: finalImageUrl || null,
        location_name: locationName,
        latitude: finalCoords?.lat || null,
        longitude: finalCoords?.lng || null,
        event_date: new Date(eventDate).toISOString(),
      })
      .select()
      .single();

    if (newItem) {
      const manualTags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase().replace('#', ''))
        .filter(Boolean);

      const autoTags = generateAutoTags(title, content, locationName);
      const finalTags = Array.from(new Set([...manualTags, ...autoTags]));

      for (const tagName of finalTags) {
        const { data: tagData } = await supabase
          .from('we_tags')
          .upsert({ user_id: user.id, name: tagName }, { onConflict: 'user_id, name' })
          .select()
          .single();

        if (tagData) {
          await supabase.from('we_item_tags').insert({ item_id: newItem.id, tag_id: tagData.id });
        }
      }
    }

    setTitle('');
    setContent('');
    setUrl('');
    setPreviewImageUrl('');
    setTagsInput('');
    setFile(null);
    setCompressionInfo('');
    resetDateToNow();
    setLoading(false);
    if (previewMarkerRef.current) {
  previewMarkerRef.current.remove();
  previewMarkerRef.current = null;
}
fetchItems();

    fetchItems();
  };

  // Ouverture de la fiche (visualisation ou édition directe)
  const openItemModal = (item: WattItem, editDirectly = false) => {
    setActiveItem(item);
    setIsModalEditing(editDirectly);
    setEditType(item.type);
    setEditTitle(item.title || '');
    setEditContent(item.content || '');
    setEditUrl(item.url || '');
    setEditLocation(item.location_name || '');
    setEditCoords(
      item.latitude != null && item.longitude != null
        ? { lat: item.latitude, lng: item.longitude }
        : null
    );
    setEditTags(item.tags.join(', '));
    setEditFile(null);

    if (item.event_date) {
      const d = new Date(item.event_date);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setEditDate(d.toISOString().slice(0, 16));
    }
  };

  const cancelModalEdit = () => {
    if (!activeItem) return;
    openItemModal(activeItem, false);
  };

  const handleModalUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeItem) return;
    setModalSaving(true);

    let updatedImageUrl = activeItem.image_url || '';
    let finalEditCoords = editCoords;

    if (editLocation.trim() !== (activeItem.location_name || '').trim() || !finalEditCoords) {
      if (editLocation.trim()) {
        const found = await geocodePlaceName(editLocation);
        if (found) finalEditCoords = { lat: found.lat, lng: found.lng };
      } else {
        finalEditCoords = null;
      }
    }

    if (editType === 'image' && editFile) {
      try {
        const compressedBlob = await compressImage(editFile, 1200, 0.75);
        const fileName = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('wattelse-media')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('wattelse-media')
            .getPublicUrl(fileName);
          updatedImageUrl = publicUrlData.publicUrl;
        }
      } catch (err) {
        console.error('Erreur compression/upload:', err);
      }
    }

    await supabase
      .from('we_items')
      .update({
        type: editType,
        title: editTitle || (editType === 'link' ? editUrl : 'Note rapide'),
        content: editContent,
        url: editType === 'link' ? editUrl : null,
        image_url: updatedImageUrl || null,
        location_name: editLocation,
        latitude: finalEditCoords?.lat || null,
        longitude: finalEditCoords?.lng || null,
        event_date: new Date(editDate).toISOString(),
      })
      .eq('id', activeItem.id);

    await supabase.from('we_item_tags').delete().eq('item_id', activeItem.id);

    const updatedTagList = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace('#', ''))
      .filter(Boolean);

    for (const tagName of updatedTagList) {
      const { data: tagData } = await supabase
        .from('we_tags')
        .upsert({ user_id: user.id, name: tagName }, { onConflict: 'user_id, name' })
        .select()
        .single();

      if (tagData) {
        await supabase.from('we_item_tags').insert({ item_id: activeItem.id, tag_id: tagData.id });
      }
    }

    const updatedLocalItem: WattItem = {
      ...activeItem,
      type: editType,
      title: editTitle || (editType === 'link' ? editUrl : 'Note rapide'),
      content: editContent,
      url: editType === 'link' ? editUrl : undefined,
      image_url: updatedImageUrl || undefined,
      location_name: editLocation,
      latitude: finalEditCoords?.lat || null,
      longitude: finalEditCoords?.lng || null,
      event_date: new Date(editDate).toISOString(),
      tags: updatedTagList,
    };

    setActiveItem(updatedLocalItem);
    setIsModalEditing(false);
    setModalSaving(false);
    fetchItems();
  };

  const togglePin = async (item: WattItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newPinned = !item.is_pinned;
    await supabase.from('we_items').update({ is_pinned: newPinned }).eq('id', item.id);
    if (activeItem?.id === item.id) {
      setActiveItem({ ...activeItem, is_pinned: newPinned });
    }
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cette fiche ?')) return;
    await supabase.from('we_items').delete().eq('id', id);
    if (activeItem?.id === id) setActiveItem(null);
    fetchItems();
  };

  // Filtrage + Tri dynamique
  const filteredAndSortedItems = items
    .filter((item) => {
      const matchesType = selectedType === 'all' ? true : item.type === selectedType;
      const matchesSearch =
        !searchQuery.trim() ||
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag = selectedTag ? item.tags.includes(selectedTag) : true;
      return matchesType && matchesSearch && matchesTag;
    })
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sortBy === 'newest') return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
      if (sortBy === 'oldest') return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '', 'fr');
      if (sortBy === 'location') return (a.location_name || 'zzz').localeCompare(b.location_name || 'zzz', 'fr');
      return 0;
    });

 const [showAllTags, setShowAllTags] = useState(false);

// Calcul de la fréquence d'utilisation et tri du plus utilisé au moins utilisé
const sortedTags = React.useMemo(() => {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    item.tags.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}, [items]);

// Garder les 5 plus utilisés (plus le tag actuellement sélectionné s'il n'est pas dans le top 5)
const displayedTags = React.useMemo(() => {
  if (showAllTags) return sortedTags;
  const top5 = sortedTags.slice(0, 5);
  if (selectedTag && !top5.some((t) => t.name === selectedTag)) {
    const active = sortedTags.find((t) => t.name === selectedTag);
    if (active) return [active, ...top5.slice(0, 4)];
  }
  return top5;
}, [sortedTags, showAllTags, selectedTag]);

  const geolocatedItems = filteredAndSortedItems.filter(
    (i) => i.latitude != null && i.longitude != null
  );

  // Détermine si la carte doit être affichée (toujours sur PC, ou sur l'onglet carte sur mobile)
  const shouldShowMap = isDesktop || mobileTab === 'map';

  // Rendu de la carte Leaflet (Tooltip au survol + Clic pour ouvrir la fiche)
  useEffect(() => {
    if (!shouldShowMap) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
      return;
    }

    const loadLeafletAndRender = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      if (!mapContainerRef.current || !window.L) return;

      if (!mapInstanceRef.current) {
        const defaultCenter =
          geolocatedItems.length > 0
            ? [geolocatedItems[0].latitude!, geolocatedItems[0].longitude!]
            : [45.4765, -75.7013];

        const map = window.L.map(mapContainerRef.current).setView(defaultCenter, 12);

        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
          className: 'watt-dark-map',
        }).addTo(map);

        markersLayerRef.current = window.L.layerGroup().addTo(map);
        mapInstanceRef.current = map;

        setTimeout(() => {
          map.invalidateSize();
        }, 200);
      }

      const map = mapInstanceRef.current;
      const layerGroup = markersLayerRef.current;
      layerGroup.clearLayers();

      const bounds: [number, number][] = [];

      geolocatedItems.forEach((item) => {
        const lat = item.latitude!;
        const lng = item.longitude!;
        bounds.push([lat, lng]);

        const marker = window.L.circleMarker([lat, lng], {
          radius: 9,
          fillColor: item.is_pinned ? '#facc15' : '#22d3ee',
          color: '#0f172a',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.95,
        });

        const tooltipHtml = `
          <div style="color:#0f172a;min-width:160px;font-family:system-ui,sans-serif;">
            <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${item.title || 'Sans titre'}</div>
            <div style="font-size:11px;color:#334155;margin-bottom:2px;">📍 ${item.location_name || 'Lieu non précisé'}</div>
            <div style="font-size:10px;color:#64748b;">📅 ${new Date(item.event_date).toLocaleDateString('fr-CA')}</div>
            <div style="font-size:10px;color:#0284c7;font-weight:600;margin-top:4px;">Cliquer pour ouvrir la fiche →</div>
          </div>
        `;

        marker.bindTooltip(tooltipHtml, {
          direction: 'top',
          offset: [0, -8],
          opacity: 0.98,
        });

        marker.on('click', () => {
          openItemModal(item, false);
        });

        marker.addTo(layerGroup);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [45, 45] });
      }
    };

    loadLeafletAndRender();
  }, [shouldShowMap, filteredAndSortedItems.length, items]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#94a3b8]">
        Chargement de WattElse...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="watt-card max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#0f172a] border border-[#334155] flex items-center justify-center font-black text-2xl text-[#facc15]">
            W<span className="text-[#22d3ee]">.</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">
            Watt<span className="text-[#facc15]">Else</span>
          </h1>
          <p className="text-sm text-[#94a3b8] mb-6">
            Ton vide-poche numérique : idées, lieux et liens au même endroit.
          </p>

          <form onSubmit={handleLogin} className="space-y-3 text-left">
            <input
              type="email"
              placeholder="ton.courriel@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#0b1120] border border-[#334155] text-sm outline-none focus:border-[#22d3ee]"
              required
            />
            <button type="submit" className="btn-electric w-full py-3 text-sm">
              Recevoir mon lien de connexion
            </button>
          </form>

          {authMessage && <p className="mt-4 text-xs text-[#22d3ee]">{authMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-4 md:p-8">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1e293b] border border-[#334155] flex items-center justify-center font-black text-xl text-[#facc15]">
            W<span className="text-[#22d3ee]">.</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-none">
              Watt<span className="text-[#facc15]">Else</span>
            </h1>
            <p className="text-[11px] text-[#94a3b8] mt-1">
              {items.length} élément{items.length > 1 ? 's' : ''} en poche
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Onglet Carte / Liste visible uniquement sur mobile (< 1024px) */}
          {!isDesktop && (
            <div className="flex bg-[#1e293b] p-1 rounded-xl border border-[#334155]">
              <button
                type="button"
                onClick={() => setMobileTab('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mobileTab === 'list' ? 'bg-[#22d3ee] text-[#0f172a]' : 'text-[#94a3b8]'
                }`}
              >
                <List className="w-3.5 h-3.5" /> Liste
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mobileTab === 'map' ? 'bg-[#22d3ee] text-[#0f172a]' : 'text-[#94a3b8]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" /> Carte ({geolocatedItems.length})
              </button>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Se déconnecter"
            className="p-2.5 rounded-xl bg-[#1e293b] border border-[#334155] text-[#94a3b8] hover:text-[#facc15] transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 1. CARTE INTERACTIVE : Toujours en 1er sur PC, ou dans l'onglet Carte sur Mobile */}
      {shouldShowMap && (
        <section className="watt-card overflow-hidden mb-6">
          <div className="p-3 bg-[#0b1120] border-b border-[#334155] flex flex-wrap items-center justify-between gap-2 text-xs text-[#94a3b8]">
            <span>
              <strong className="text-[#facc15]">{geolocatedItems.length}</strong> note(s) affichée(s) sur la carte (survole un point pour voir les infos, clique pour ouvrir)
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#facc15] inline-block" /> Épinglée
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee] inline-block" /> Standard
              </span>
            </div>
          </div>
          <div
            ref={mapContainerRef}
            style={{ height: isDesktop ? '340px' : '500px', width: '100%' }}
            className="z-10"
          />
        </section>
      )}

      {/* 2. PANEL D'AJOUT RAPIDE (Réductible) : Visible sur PC et dans l'onglet Liste sur Mobile */}
      {(isDesktop || mobileTab === 'list') && (
        <section className="watt-card p-4 md:p-5 mb-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsAddCollapsed(!isAddCollapsed)}
              className="flex items-center gap-2 text-left group"
            >
              <span className="w-7 h-7 rounded-lg bg-[#0f172a] border border-[#334155] flex items-center justify-center text-[#facc15] group-hover:border-[#facc15] transition">
                <Plus className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#f8fafc] flex items-center gap-2">
                  Ajouter au vide-poche
                  <span className="text-[11px] font-normal text-[#22d3ee] hidden sm:inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Auto-tags & GPS actifs
                  </span>
                </h2>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsAddCollapsed(!isAddCollapsed)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0f172a] border border-[#334155] text-xs text-[#94a3b8] hover:text-[#f8fafc] flex items-center gap-1 transition"
            >
              {isAddCollapsed ? (
                <>
                  Déplier <ChevronDown className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Réduire <ChevronUp className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {!isAddCollapsed && (
            <form onSubmit={handleSave} className="mt-4 pt-4 border-t border-[#334155]/60">
              <div className="flex gap-2 mb-4">
                {(['note', 'link', 'image'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                      type === t ? 'bg-[#22d3ee] text-[#0f172a]' : 'bg-[#0f172a] text-[#94a3b8]'
                    }`}
                  >
                    {t === 'note' ? 'Note' : t === 'link' ? 'Lien Web' : 'Photo'}
                  </button>
                ))}
              </div>

              {type === 'link' && (
                <div className="relative mb-3">
                  <input
                    type="url"
                    placeholder="Colle l'adresse web ici (https://...) pour remplir automatiquement"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="w-full p-2.5 pr-10 rounded-lg bg-[#0b1120] border border-[#22d3ee] text-sm text-[#22d3ee] outline-none"
                    required
                  />
                  {fetchingUrl && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#facc15] absolute right-3 top-3" />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Titre (rempli auto si lien web)..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm focus:border-[#facc15] outline-none"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Lieu ou aréna (ex: Centre Slush Puppie)"
                    value={locationName}
                    onChange={(e) => {
                      setLocationName(e.target.value);
                      setCoords(null);
                    }}
                    className="flex-1 p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm focus:border-[#22d3ee] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleManualGeocodeCreate}
                    disabled={geocodingLocation || !locationName.trim()}
                    title="Géolocaliser ce lieu saisi à la main"
                    className="px-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-xs text-[#facc15] hover:bg-[#1e293b] disabled:opacity-40 flex items-center gap-1"
                  >
                    {geocodingLocation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Situer</span>
                  </button>
                  <button
                    type="button"
                    onClick={detectLocationSilently}
                    title="Ma position GPS actuelle"
                    className="p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-[#22d3ee] hover:bg-[#1e293b]"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {coords && (
                <p className="text-[11px] text-[#22d3ee] mb-3 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Position enregistrée ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
                </p>
              )}

              {type === 'image' && (
                <div className="mb-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="w-full p-2 text-sm text-[#94a3b8]"
                    required
                  />
                  {compressionInfo && (
                    <p className="text-xs text-[#22d3ee] mt-1">{compressionInfo}</p>
                  )}
                </div>
              )}

              <textarea
                placeholder="Notes, résumé de discussion, détails..."
                rows={2}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-2.5 mb-3 rounded-lg bg-[#0b1120] border border-[#334155] text-sm focus:border-[#facc15] outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3 flex-1">
                  <input
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="p-2 rounded-lg bg-[#0b1120] border border-[#334155] text-xs text-[#94a3b8]"
                  />
                  <input
                    type="text"
                    placeholder="Tags en plus (optionnel, ajout auto actif)"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="flex-1 min-w-[200px] p-2 rounded-lg bg-[#0b1120] border border-[#334155] text-xs outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-electric px-5 py-2.5 text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {loading ? 'Enregistrement...' : 'Mettre en poche'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* 3. PANEL DE RECHERCHE, SLIDER DE TYPE ET TRI */}
      <section className="watt-card p-4 mb-6 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Barre de recherche */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Rechercher par mot-clé, lieu, aréna ou tag..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Réduit automatiquement le panel d'ajout dès qu'on tape une recherche
                if (e.target.value.trim().length > 0 && !isAddCollapsed) {
                  setIsAddCollapsed(true);
                }
              }}
              className="w-full pl-10 pr-8 py-2 rounded-xl bg-[#0b1120] border border-[#334155] text-sm focus:outline-none focus:border-[#22d3ee]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[#94a3b8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sélecteur de tri */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-[#facc15] shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="p-2 rounded-xl bg-[#0b1120] border border-[#334155] text-xs text-[#f8fafc] outline-none focus:border-[#facc15]"
            >
              <option value="newest">Plus récent d'abord</option>
              <option value="oldest">Plus ancien d'abord</option>
              <option value="title">Titre (A → Z)</option>
              <option value="location">Par lieu (A → Z)</option>
            </select>
          </div>
        </div>

        {/* Slider de type */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'all', label: 'Tous' },
                { key: 'note', label: 'Note' },
                { key: 'link', label: 'Lien Web' },
                { key: 'image', label: 'Photo' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedType(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  selectedType === tab.key
                    ? 'bg-[#22d3ee] text-[#0f172a]'
                    : 'bg-[#0f172a] text-[#94a3b8] hover:text-[#f8fafc]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-[#94a3b8]">
            {filteredAndSortedItems.length} résultat{filteredAndSortedItems.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Filtres par Tags */}
        {sortedTags.length > 0 && (
  <div className="flex flex-wrap items-center gap-2 pt-2">
    <button
      type="button"
      onClick={() => setSelectedTag(null)}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        !selectedTag
          ? 'bg-[#facc15] text-[#0f172a] border-[#facc15] font-bold'
          : 'border-[#334155] text-[#94a3b8] hover:text-white'
      }`}
    >
      Tous les tags
    </button>

    {displayedTags.map(({ name, count }) => (
      <button
        key={name}
        type="button"
        onClick={() => setSelectedTag(name === selectedTag ? null : name)}
        className={`tag-pill cursor-pointer flex items-center gap-1.5 transition ${
          selectedTag === name ? 'ring-2 ring-[#22d3ee] bg-[#22d3ee]/20' : ''
        }`}
      >
        <span>#{name}</span>
        <span className="text-[10px] opacity-70">({count})</span>
      </button>
    ))}

    {sortedTags.length > 5 && (
      <button
        type="button"
        onClick={() => setShowAllTags(!showAllTags)}
        className="text-xs px-3 py-1 rounded-full bg-[#0f172a] border border-[#334155] text-[#94a3b8] hover:text-[#22d3ee] hover:border-[#22d3ee] transition"
      >
        {showAllTags ? 'Réduire' : `+ ${sortedTags.length - 5} autres`}
      </button>
    )}
  </div>
)}

      </section>

      {/* 4. RÉSULTATS (Grille des fiches) */}
      {(isDesktop || mobileTab === 'list') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedItems.map((item) => (
            <article
              key={item.id}
              onClick={() => openItemModal(item, false)}
              className="watt-card p-4 flex flex-col justify-between cursor-pointer group"
            >
              <div>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-40 object-cover rounded-lg mb-3"
                  />
                )}

                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="font-bold text-base text-[#f8fafc] group-hover:text-[#22d3ee] transition">
                    {item.title}
                  </h2>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openItemModal(item, true);
                      }}
                      title="Modifier"
                      className="text-[#94a3b8] hover:text-[#22d3ee] transition p-1"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => togglePin(item, e)}
                      title={item.is_pinned ? 'Désépingler' : 'Épingler'}
                      className={`${
                        item.is_pinned ? 'text-[#facc15]' : 'text-[#94a3b8] hover:text-[#facc15]'
                      } transition p-1`}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-xs text-[#22d3ee] hover:underline mb-2 break-all"
                  >
                    <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                    {item.url}
                  </a>
                )}

                <p className="text-sm text-[#cbd5e1] whitespace-pre-line line-clamp-3 mb-4">
                  {item.content}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {item.tags.map((t) => (
                    <span key={t} className="tag-pill">
                      #{t}
                    </span>
                  ))}
                </div>

                <div className="pt-2.5 border-t border-[#334155] flex items-center justify-between text-[11px] text-[#94a3b8]">
                  <span className="flex items-center gap-1 truncate max-w-[58%]">
                    <MapPin
                      className={`w-3 h-3 shrink-0 ${
                        item.latitude != null ? 'text-[#22d3ee]' : 'text-[#facc15]'
                      }`}
                    />
                    {item.location_name || 'Lieu non précisé'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#22d3ee]" />
                    {new Date(item.event_date).toLocaleDateString('fr-CA')}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* MODALE DE VISUALISATION & MODIFICATION */}
      {activeItem && (
        <div
          onClick={() => setActiveItem(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="watt-card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl"
          >
            {!isModalEditing ? (
              <div>
                <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-[#334155]">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-bold text-[#22d3ee]">
                      {activeItem.type === 'note'
                        ? 'Note'
                        : activeItem.type === 'link'
                        ? 'Lien Web'
                        : 'Photo'}
                    </span>
                    <h2 className="text-xl font-bold text-[#f8fafc] mt-0.5">{activeItem.title}</h2>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsModalEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22d3ee] text-[#0f172a] text-xs font-bold hover:brightness-110 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(activeItem)}
                      className={`p-2 rounded-lg border border-[#334155] ${
                        activeItem.is_pinned ? 'text-[#facc15]' : 'text-[#94a3b8]'
                      }`}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(activeItem.id)}
                      title="Supprimer"
                      className="p-2 rounded-lg border border-[#334155] text-[#94a3b8] hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveItem(null)}
                      className="p-2 rounded-lg border border-[#334155] text-[#94a3b8] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {activeItem.image_url && (
                  <img
                    src={activeItem.image_url}
                    alt={activeItem.title}
                    className="w-full max-h-80 object-contain rounded-xl bg-[#0b1120] mb-4"
                  />
                )}

                {activeItem.url && (
                  <a
                    href={activeItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-[#0b1120] border border-[#334155] text-sm text-[#22d3ee] hover:underline break-all"
                  >
                    <LinkIcon className="w-4 h-4 shrink-0" />
                    {activeItem.url}
                  </a>
                )}

                <div className="text-sm text-[#e2e8f0] whitespace-pre-line leading-relaxed mb-6">
                  {activeItem.content || <span className="italic text-[#64748b]">Aucun détail supplémentaire.</span>}
                </div>

                {activeItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {activeItem.tags.map((t) => (
                      <span key={t} className="tag-pill">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-[#334155] flex flex-wrap items-center justify-between gap-2 text-xs text-[#94a3b8]">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#facc15]" />
                    {activeItem.location_name || 'Lieu non précisé'}
                    {activeItem.latitude != null && (
                      <span className="text-[10px] text-[#22d3ee]">(Géolocalisé)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#22d3ee]" />
                    {new Date(activeItem.event_date).toLocaleString('fr-CA', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleModalUpdate} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
                  <h2 className="text-lg font-bold text-[#facc15]">Modifier la fiche</h2>
                  <button
                    type="button"
                    onClick={cancelModalEdit}
                    className="text-xs text-[#94a3b8] hover:text-white flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Fermer
                  </button>
                </div>

                <div className="flex gap-2">
                  {(['note', 'link', 'image'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                        editType === t ? 'bg-[#22d3ee] text-[#0f172a]' : 'bg-[#0f172a] text-[#94a3b8]'
                      }`}
                    >
                      {t === 'note' ? 'Note' : t === 'link' ? 'Lien Web' : 'Photo'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-[#94a3b8] mb-1">Titre</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm focus:border-[#facc15] outline-none"
                    required
                  />
                </div>

                {editType === 'link' && (
                  <div>
                    <label className="block text-xs text-[#94a3b8] mb-1">Adresse Web (URL)</label>
                    <input
                      type="url"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm text-[#22d3ee] outline-none"
                      required
                    />
                  </div>
                )}

                {editType === 'image' && (
                  <div>
                    <label className="block text-xs text-[#94a3b8] mb-1">
                      Remplacer la photo (laisser vide pour conserver l'actuelle)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                      className="w-full p-2 text-xs text-[#94a3b8]"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#94a3b8] mb-1">Lieu / Aréna</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(e) => {
                          setEditLocation(e.target.value);
                          setEditCoords(null);
                        }}
                        className="flex-1 p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm outline-none focus:border-[#22d3ee]"
                      />
                      <button
                        type="button"
                        onClick={handleManualGeocodeEdit}
                        disabled={modalGeocoding || !editLocation.trim()}
                        title="Situer sur la carte"
                        className="px-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-xs text-[#facc15] hover:bg-[#1e293b] disabled:opacity-40 flex items-center gap-1"
                      >
                        {modalGeocoding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Navigation className="w-3.5 h-3.5" />
                        )}
                        Situer
                      </button>
                    </div>
                    {editCoords && (
                      <p className="text-[10px] text-[#22d3ee] mt-1">
                        ✓ Coordonnées GPS valides ({editCoords.lat.toFixed(4)}, {editCoords.lng.toFixed(4)})
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-[#94a3b8] mb-1">Date et heure</label>
                    <input
                      type="datetime-local"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm text-[#f8fafc]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#94a3b8] mb-1">Détails / Notes</label>
                  <textarea
                    rows={4}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm focus:border-[#facc15] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#94a3b8] mb-1">Tags (séparés par virgule)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#0b1120] border border-[#334155] text-sm outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
                  <button
                    type="button"
                    onClick={cancelModalEdit}
                    className="px-4 py-2 rounded-xl border border-[#334155] text-xs font-semibold text-[#94a3b8] hover:text-white"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={modalSaving}
                    className="btn-electric px-5 py-2 text-xs flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {modalSaving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
