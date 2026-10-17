<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Days: the level above sets. A raffle file's raffles are grouped by
     * the day of the event they are drawn on — Day 1, Day 2, … — and inside
     * each day by set. Null is no day yet.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->unsignedTinyInteger('draw_day')->nullable()->after('raffle_file_id');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('draw_day');
        });
    }
};
