<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Winners revealed by a pre-draw before this change were marked as
     * winners only in the pre-draw's own participant list. Mark them in every
     * list they are in — the main raffle's and the other pre-draws' — as new
     * reveals now do.
     */
    public function up(): void
    {
        $tickets = DB::table('winners')
            ->join('raffles', 'raffles.id', '=', 'winners.raffle_id')
            ->where('raffles.is_predraw', true)
            ->pluck('winners.ticket_number')
            ->unique()
            ->all();

        foreach (array_chunk($tickets, 500) as $chunk) {
            DB::table('participants')
                ->whereIn('ticket_number', $chunk)
                ->where('status', 'ACTIVE')
                ->update(['status' => 'WINNER', 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // Data only; nothing to undo.
    }
};
