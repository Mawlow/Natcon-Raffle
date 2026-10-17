<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A raffle for the people who have not won anything yet: with
     * `only_never_won` on, its draws pick only from those who have won
     * nothing in the whole event, any day, Day 2's draws included. The
     * ordinary rule counts a day at a time (a Day 2 winner is still "to win"
     * on Day 1); this one counts the event as a whole.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->boolean('only_never_won')->default(false)->after('winners_out_for_event');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('only_never_won');
        });
    }
};
