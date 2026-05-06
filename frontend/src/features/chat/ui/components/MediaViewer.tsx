import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { Message } from "../../state/chatStore";

interface MediaViewerProps {
  media: Message;
  onClose: () => void;
}

export function MediaViewer({ media, onClose }: MediaViewerProps) {
  if (!media) return null;

  const attachment = media.metadata?.attachment;
  const url = attachment?.url || attachment?.local_url;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col"
      >
        <header className="p-4 flex items-center justify-between text-white z-10">
          <div className="flex flex-col">
            <p className="font-bold">{attachment?.file_name || "Image"}</p>
            <p className="text-xs opacity-60">{media.sender_name} • {new Date(media.sent_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <a href={url} download className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
              <Download size={20} />
            </a>
            <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={url}
            alt="Full size preview"
            className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
