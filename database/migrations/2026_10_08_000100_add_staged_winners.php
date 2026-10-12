<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pre-selected winners: for a raffle whose winners were chosen before the
     * event, the operator lists them in order, each with the prize they won,
     * and the draw on the screens reveals them one after another instead of
     * picking at random. Each winner keeps the prize they were listed with.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            // [{"participant_id": 12, "prize_name": "Brand New Car"}, ...], in draw order.
            $table->json('staged_winners')->nullable()->after('draw_filter');
        });

        Schema::table('winners', function (Blueprint $table) {
            $table->string('prize_name', 160)->nullable()->after('raffle_prize_id');
        });
    }

    public function down(): void
    {
        Schema::table('winners', function (Blueprint $table) {
            $table->dropColumn('prize_name');
        });

        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('staged_winners');
        });
    }
};
