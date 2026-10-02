<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('winners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('participant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('draw_event_id')->nullable()->constrained()->nullOnDelete();
            $table->string('ticket_number', 64);
            // Winner #1, #2, ... within the raffle. Unique, so a position can never be filled twice.
            $table->unsignedSmallInteger('position');
            $table->timestamp('drawn_at');
            $table->foreignId('drawn_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['raffle_id', 'position']);
            $table->index('raffle_id');
            $table->index('ticket_number');
            $table->index(['raffle_id', 'ticket_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('winners');
    }
};
