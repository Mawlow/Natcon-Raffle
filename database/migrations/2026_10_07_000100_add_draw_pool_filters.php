<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A participant can qualify under several developers ("Cebu Landmasters |
     * Filinvest"), so they are kept as a list beside the single tag held in
     * `category`. A raffle can then be drawn from one slice of its entrants:
     * every participant, only some tags, or only some developers.
     */
    public function up(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->json('developers')->nullable()->after('category');
        });

        Schema::table('raffles', function (Blueprint $table) {
            // null: everyone. Otherwise {"type": "tag"|"developer", "values": [...]}.
            $table->json('draw_filter')->nullable()->after('participant_pool');
        });
    }

    public function down(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->dropColumn('developers');
        });

        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('draw_filter');
        });
    }
};
