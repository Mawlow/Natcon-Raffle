<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Everyone in a raffle file wins once. Draws now show a winner as a
     * winner in the file's other participant lists as well; this does the
     * same for the winners drawn before the change.
     */
    public function up(): void
    {
        $files = DB::table('raffles')->whereNotNull('raffle_file_id')->distinct()->pluck('raffle_file_id');

        foreach ($files as $fileId) {
            $raffleIds = DB::table('raffles')->where('raffle_file_id', $fileId)->pluck('id')->all();
            $tickets = DB::table('winners')->whereIn('raffle_id', $raffleIds)->distinct()->pluck('ticket_number')->all();

            foreach (array_chunk($tickets, 500) as $chunk) {
                DB::table('participants')
                    ->whereIn('raffle_id', $raffleIds)
                    ->whereIn('ticket_number', $chunk)
                    ->where('status', 'ACTIVE')
                    ->update(['status' => 'WINNER', 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        // Data only; nothing to undo.
    }
};
