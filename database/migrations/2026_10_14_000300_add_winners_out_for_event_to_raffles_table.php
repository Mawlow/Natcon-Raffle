<?php

use App\Models\RaffleFile;
use App\Services\RaffleFileService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Everyone in a raffle file wins once per day: a winner of one of Day
     * 1's draws is out of Day 1's other draws, but back in play on Day 2.
     * A raffle with a big prize can keep its winners out for the whole
     * event instead (`winners_out_for_event`): they win nothing else, any day.
     *
     * The participant lists' winner marks follow the same rule, so they
     * are worked out again for every file.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->boolean('winners_out_for_event')->default(false)->after('allow_repeat_winners');
        });

        $files = app(RaffleFileService::class);

        foreach (RaffleFile::query()->get() as $file) {
            $files->resyncWinnerMarks($file);
        }
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('winners_out_for_event');
        });
    }
};
