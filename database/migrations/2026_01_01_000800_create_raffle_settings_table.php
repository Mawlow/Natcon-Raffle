<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('raffle_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            $table->boolean('sound_countdown')->default(true);
            $table->boolean('sound_drawing')->default(true);
            $table->boolean('sound_winner')->default(true);
            $table->boolean('sound_celebration')->default(true);
            $table->boolean('show_confetti')->default(true);
            $table->unsignedSmallInteger('countdown_seconds')->default(3);
            $table->unsignedInteger('roll_duration_ms')->default(6000);
            $table->timestamps();

            $table->unique('raffle_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raffle_settings');
    }
};
