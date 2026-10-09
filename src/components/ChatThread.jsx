import React, { useRef, useEffect, useState } from "react";
import { ArrowLeft, Send, Loader2, Users, AlertCircle, LogOut, Ban, ShieldCheck, Pencil, Camera, Check, X } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function ChatThread({ conversation, messages, user, onSend, onBack, sending, onLeave, onBlock, onUnblock, blockedByMe, otherName, onUpdateGroup }) {
  const [text, setText] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPhotoUrl, setGroupPhotoUrl] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const scrollRef = useRef(null);
  const groupPhotoRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setGroupName(conversation?.name || "");
    setGroupPhotoUrl(conversation?.group_photo_url || "");
    setEditingGroup(false);
  }, [conversation?.id, conversation?.name, conversation?.group_photo_url]);

  const chooseGroupPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        setGroupPhotoUrl(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const saveGroup = async () => {
    const name = groupName.trim();
    if (!name || !onUpdateGroup) return;
    setSavingGroup(true);
    try {
      await onUpdateGroup(conversation, { name, group_photo_url: groupPhotoUrl });
      setEditingGroup(false);
    } finally {
      setSavingGroup(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText("");
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-slate-400 text-sm">Select a chat to view the conversation.</p>
        </div>
      </div>
    );
  }

  const isGroup = conversation.is_group;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        {onBack && (
          <button onClick={onBack} className="lg:hidden text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        {isGroup ? (
          conversation.group_photo_url ? <img src={conversation.group_photo_url} alt={conversation.name || "Group"} className="w-9 h-9 rounded-full object-cover" /> : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900">
              <Users className="w-5 h-5" />
            </div>
          )
        ) : (
          (() => {
            const other = (conversation.members || []).find((m) => m.user_id !== user?.id);
            return <UserAvatar name={conversation.name || other?.name} photo_url={other?.photo_url} size="md" />;
          })()
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white truncate">{conversation.name}</div>
            {isGroup && (
              <button onClick={() => setEditingGroup(true)} title="Edit group" className="w-7 h-7 shrink-0 rounded-lg text-slate-400 hover:text-lime-300 hover:bg-white/5 flex items-center justify-center">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {conversation.members?.map((m) => m.name).join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {blockedByMe ? (
            <button onClick={() => onUnblock?.(conversation)} title={`Unblock ${otherName || ""}`} className="w-9 h-9 rounded-lg text-slate-400 hover:text-lime-300 hover:bg-white/5 flex items-center justify-center transition">
              <ShieldCheck className="w-4 h-4" />
            </button>
          ) : !isGroup ? (
            <button onClick={() => setConfirmBlock(true)} title="Block user" className="w-9 h-9 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/5 flex items-center justify-center transition">
              <Ban className="w-4 h-4" />
            </button>
          ) : null}
          <button onClick={() => setConfirmLeave(true)} title="Leave chat" className="w-9 h-9 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/5 flex items-center justify-center transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editingGroup && isGroup && (
        <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/[0.03]">
          <input ref={groupPhotoRef} type="file" accept="image/*" onChange={chooseGroupPhoto} className="hidden" />
          <button type="button" onClick={() => groupPhotoRef.current?.click()} title="Change group photo" className="w-9 h-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-sky-400 to-indigo-500 text-slate-900">
            {groupPhotoUrl ? <img src={groupPhotoUrl} alt="Group" className="w-full h-full object-cover" /> : <Camera className="w-4 h-4" />}
          </button>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime-400/50" aria-label="Group name" />
          <button type="button" onClick={saveGroup} disabled={savingGroup || !groupName.trim()} title="Save group changes" className="w-8 h-8 rounded-lg bg-lime-400 text-slate-900 flex items-center justify-center disabled:opacity-50">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setEditingGroup(false)} title="Cancel group changes" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-600 mt-8">No messages yet — say hello 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && (
                <UserAvatar name={m.sender_name} photo_url={m.sender_photo} size="sm" className="mt-1" />
              )}
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 transition ${
                m._failed
                  ? "bg-rose-500/20 text-slate-100 border border-rose-500/30 rounded-br-sm"
                  : mine
                    ? "bg-lime-400 text-slate-900 rounded-br-sm"
                    : "bg-white/5 text-slate-100 rounded-bl-sm"
              } ${m._pending ? "opacity-60" : ""}`}>
                {isGroup && !mine && (
                  <div className="text-[11px] font-semibold text-lime-400 mb-0.5">{m.sender_name}</div>
                )}
                <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${mine ? "text-slate-700" : "text-slate-500"}`}>
                  {m._pending && <Loader2 className="w-3 h-3 animate-spin" />}
                  {m._failed && <AlertCircle className="w-3 h-3 text-rose-300" />}
                  {new Date(m.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {blockedByMe ? (
        <div className="flex items-center justify-between gap-3 p-3 border-t border-white/5 bg-rose-500/5">
          <span className="text-sm text-rose-300">You blocked {otherName || "this user"}</span>
          <button onClick={() => onUnblock?.(conversation)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 font-semibold transition">
            Unblock
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2 p-3 border-t border-white/5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-400/50"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-10 h-10 shrink-0 rounded-full bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-900 flex items-center justify-center transition"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      )}
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block ${otherName || "this user"}?`}
        description="You won't be able to message each other here. You can unblock anytime."
        confirmText="Block"
        destructive
        onConfirm={() => { onBlock?.(conversation); setConfirmBlock(false); }}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave this chat?"
        description="You'll be removed from this conversation."
        confirmText="Leave"
        destructive
        onConfirm={() => { onLeave?.(conversation); setConfirmLeave(false); }}
      />
    </div>
  );
}