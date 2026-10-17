<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A winner announced on stage is saved like a drawn one: the prize on the
     * Prize Display gets a raffle of its own (made the first time a winner
     * goes up) and each winner put on the screen is a row in `winners`, so the
     * manual draw shows up in the Winners page, the reports and the exports
     * with its people marked WINNER, exactly like a raffle drawn here.
     */
    public function up(): void
    {
        Schema::table('prize_slides', function (Blueprint $table) {
            $table->foreignId('raffle_id')->nullable()->after('id')->constrained()->nullOnDelete();
        });

        Schema::table('prize_slide_winners', function (Blueprint $table) {
            $table->foreignId('winner_id')->nullable()->after('participant_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('prize_slide_winners', function (Blueprint $table) {
            $table->dropConstrainedForeignId('winner_id');
        });

        Schema::table('prize_slides', function (Blueprint $table) {
            $table->dropConstrainedForeignId('raffle_id');
        });
    }
};
