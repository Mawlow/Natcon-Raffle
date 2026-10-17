<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Winners used to be marked by ticket number across every raffle in the
     * database, so a pre-selected or pre-drawn winner in one raffle file
     * showed as a winner in every other file reusing the same ticket
     * numbers. Winners now stay inside their own file: this puts back in
     * play anyone shown as a winner in a raffle that never drew them and
     * whose ticket is on no pre-selected list in that raffle's file.
     */
    public function up(): void
    {
        $raffles = DB::table('raffles')->get(['id', 'raffle_file_id', 'staged_winners']);

        // The tickets on pre-selected lists, by raffle file (null: no file).
        $stagedByFile = [];

        foreach ($raffles as $raffle) {
            $ids = array_column(json_decode($raffle->staged_winners ?? '[]', true) ?: [], 'participant_id');

            if ($ids === []) {
                continue;
            }

            $tickets = DB::table('participants')->whereIn('id', $ids)->pluck('ticket_number')->all();
            $key = $raffle->raffle_file_id ?? 'none';
            $stagedByFile[$key] = array_merge($stagedByFile[$key] ?? [], $tickets);
        }

        foreach ($raffles as $raffle) {
            $query = DB::table('participants')
                ->where('raffle_id', $raffle->id)
                ->where('status', 'WINNER')
                ->whereNotExists(fn ($won) => $won->selectRaw('1')->from('winners')
                    ->whereColumn('winners.raffle_id', 'participants.raffle_id')
                    ->whereColumn('winners.ticket_number', 'participants.ticket_number'));

            $staged = array_values(array_unique($stagedByFile[$raffle->raffle_file_id ?? 'none'] ?? []));

            if ($staged !== []) {
                $query->whereNotIn('ticket_number', $staged);
            }

            $query->update(['status' => 'ACTIVE', 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // Data only; nothing to undo.
    }
};
