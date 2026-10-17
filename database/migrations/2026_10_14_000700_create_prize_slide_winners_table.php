<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The winners of a raffle drawn by hand on stage: as the host announces
     * each name, the operator looks the person up in the participant list
     * and puts them on the Prize Display, which lists them like a finished
     * raffle's winners. Kept with the prize so the list survives a refresh
     * and can be shown again.
     */
    public function up(): void
    {
        Schema::create('prize_slide_winners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prize_slide_id')->constrained()->cascadeOnDelete();
            // The participant row the name was taken from, when found in a list.
            $table->foreignId('participant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('ticket_number', 64)->nullable();
            $table->string('name');
            $table->unsignedInteger('position');
            $table->timestamps();

            $table->index(['prize_slide_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prize_slide_winners');
    }
};
