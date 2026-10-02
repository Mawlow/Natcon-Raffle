import { motion } from 'framer-motion';
import { formatNumber } from '../../lib/format';

export default function StatCard({ icon: Icon, label, value, hint, accent = false, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
            className={`panel group relative overflow-hidden p-5 transition-colors duration-300 hover:border-gold/35 ${accent ? 'panel-gold' : ''}`}
        >
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold/5 blur-2xl transition-opacity duration-500 group-hover:bg-gold/10" />

            <div className="flex items-start justify-between gap-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
                {Icon && (
                    <span className="rounded-lg border border-gold/20 bg-gold/5 p-2 text-gold">
                        <Icon size={16} />
                    </span>
                )}
            </div>

            <p className="tabular mt-4 font-display text-4xl font-extrabold leading-none text-white">
                {typeof value === 'number' ? formatNumber(value) : value}
            </p>

            {hint && <p className="mt-2 text-xs text-muted-dim">{hint}</p>}
        </motion.div>
    );
}
